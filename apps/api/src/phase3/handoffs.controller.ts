import {
  BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards,
  Injectable, OnModuleDestroy, ServiceUnavailableException, ForbiddenException, ConflictException
} from '@nestjs/common';
import { Pool } from 'pg';
import { requirePhase3SyntheticMode } from './phase3-mode';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
import { recordCustodyEvent } from './custody.repository';
import { CustodyConflict } from './custody';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type HandoffSpecimen = {
  specimen_id: string; expected_version: number; custody_version: number; status: string
};
type Handoff = {
  id: string; assignment_id: string; order_id: string;
  courier_staff_id: string; sender_staff_id: string;
  sender_user_id: string; courier_user_id: string;
  request_key: string; status: string; receipt_key: string | null;
};

@Injectable()
export class Phase3HandoffService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({
      connectionString: process.env.DATABASE_URL, max: 4
    });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  async listForCourier(identity: AuthenticatedIdentity) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'specimens:transport');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      'SELECT h.id,h.assignment_id,h.status,h.created_at,count(hs.specimen_id)::integer AS specimen_count ' +
      'FROM phase3_handoff_offers h ' +
      'JOIN staff st ON st.id=h.courier_staff_id JOIN users usr ON usr.id=st.user_id ' +
      'JOIN phase3_handoff_specimens hs ON hs.offer_id=h.id ' +
      "WHERE usr.identity_subject=$1 AND st.active AND st.role='courier' AND h.status='offered' " +
      'GROUP BY h.id,h.assignment_id,h.status,h.created_at ' +
      'ORDER BY h.created_at ASC LIMIT 100',
      [identity.subject]);
    return { data: result.rows };
  }

  async offer(identity: AuthenticatedIdentity, assignmentId: string, courierStaffId: string, requestKey: string) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'specimens:collect');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assigned = await client.query<{ order_id: string; staff_id: string }>(
        'SELECT a.order_id,a.staff_id FROM phase3_assignments a ' +
        'JOIN staff st ON st.id=a.staff_id JOIN users usr ON usr.id=st.user_id ' +
        "WHERE a.id=$1 AND usr.identity_subject=$2 AND st.active AND st.role='phlebotomist' " +
        "AND a.status='collecting' FOR UPDATE OF a",
        [assignmentId, identity.subject]);
      const current = assigned.rows[0];
      if (!current) throw new ForbiddenException('Assignment access denied');
      const courier = await client.query(
        "SELECT id FROM staff WHERE id=$1 AND active AND role='courier' FOR UPDATE",
        [courierStaffId]);
      if (courier.rowCount !== 1 || current.staff_id === courierStaffId)
        throw new ForbiddenException('Courier unavailable');
      const existing = await client.query<{
        id: string; request_key: string; courier_staff_id: string; status: string
      }>(
        'SELECT id,request_key,courier_staff_id,status FROM phase3_handoff_offers ' +
        "WHERE assignment_id=$1 AND status IN ('offered','received') FOR UPDATE",
        [assignmentId]);
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (prior.request_key === requestKey && prior.courier_staff_id === courierStaffId) {
          await client.query('COMMIT');
          return { data: { id: prior.id, status: prior.status, replayed: true } };
        }
        throw new ConflictException('Another handoff already exists');
      }
      const members = await client.query<{
        id: string; status: string; custody_version: number
      }>('SELECT id,status,custody_version FROM specimens WHERE order_id=$1 ' +
         'ORDER BY id FOR UPDATE', [current.order_id]);
      if (!members.rows.length || members.rows.length > 100 ||
          members.rows.some(member => member.status !== 'packaged')) {
        throw new ConflictException('All specimens must be packaged before handoff');
      }
      const unresolved = await client.query(
        "SELECT 1 FROM phase3_incidents WHERE specimen_id=ANY($1::uuid[]) " +
        "AND resolution_status='open' LIMIT 1", [members.rows.map(member => member.id)]);
      if (unresolved.rowCount) throw new ConflictException('Open specimen incident blocks handoff');
      const created = await client.query<{ id: string }>(
        'INSERT INTO phase3_handoff_offers(assignment_id,request_key,sender_staff_id,courier_staff_id) ' +
        'VALUES($1,$2,$3,$4) RETURNING id',
        [assignmentId, requestKey, current.staff_id, courierStaffId]);
      const offerId = created.rows[0]!.id;
      await client.query(
        'INSERT INTO phase3_handoff_specimens(offer_id,specimen_id,expected_version) ' +
        'SELECT $1, x.id, x.version FROM unnest($2::uuid[],$3::integer[]) AS x(id,version)',
        [offerId, members.rows.map(member => member.id),
          members.rows.map(member => member.custody_version)]);
      await client.query('COMMIT');
      return { data: { id: offerId, status: 'offered', specimenCount: members.rows.length, replayed: false } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error &&
          (error as { code: unknown }).code === '23505') throw new ConflictException('Handoff already offered');
      throw error;
    } finally { client.release(); }
  }

  async acknowledge(identity: AuthenticatedIdentity, offerId: string, receiptKey: string) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'specimens:transport');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<Handoff>(
        'SELECT h.id,h.assignment_id,h.courier_staff_id,h.sender_staff_id,h.status,h.receipt_key,' +
        'h.request_key,a.order_id,sender.user_id AS sender_user_id,courier.user_id AS courier_user_id ' +
        'FROM phase3_handoff_offers h ' +
        'JOIN phase3_assignments a ON a.id=h.assignment_id ' +
        'JOIN staff sender ON sender.id=h.sender_staff_id ' +
        'JOIN staff courier ON courier.id=h.courier_staff_id ' +
        'JOIN users usr ON usr.id=courier.user_id ' +
        "WHERE h.id=$1 AND usr.identity_subject=$2 AND courier.active AND courier.role='courier' " +
        "AND sender.active AND sender.role='phlebotomist' FOR UPDATE OF h",
        [offerId, identity.subject]);
      const offer = result.rows[0];
      if (!offer) throw new ForbiddenException('Handoff not assigned to this courier');
      if (offer.status === 'received' && offer.receipt_key === receiptKey) {
        await client.query('COMMIT');
        return { data: { id: offerId, status: 'received', replayed: true } };
      }
      if (offer.status !== 'offered') throw new ConflictException('Handoff already finalized');
      const order = await client.query<{ status: string }>(
        'SELECT status FROM orders WHERE id=$1 FOR UPDATE', [offer.order_id]);
      if (!['assigned', 'collection_in_progress'].includes(order.rows[0]?.status ?? '')) {
        throw new ConflictException('Order is no longer eligible for courier handoff');
      }
      const members = await client.query<HandoffSpecimen>(
        'SELECT hs.specimen_id,hs.expected_version,sp.custody_version,sp.status ' +
        'FROM phase3_handoff_specimens hs JOIN specimens sp ON sp.id=hs.specimen_id ' +
        'WHERE hs.offer_id=$1 ORDER BY sp.id FOR UPDATE OF sp', [offerId]);
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM specimens WHERE order_id=$1', [offer.order_id]);
      if (!members.rows.length || count.rows[0]?.count !== members.rows.length ||
          members.rows.some(member => member.status !== 'packaged' ||
            member.custody_version !== member.expected_version)) {
        throw new ConflictException('Custody changed after handoff offer');
      }
      const unresolved = await client.query(
        "SELECT 1 FROM phase3_incidents WHERE specimen_id=ANY($1::uuid[]) " +
        "AND resolution_status='open' LIMIT 1", [members.rows.map(member => member.specimen_id)]);
      if (unresolved.rowCount) throw new ConflictException('Open specimen incident blocks acknowledgment');
      for (const member of members.rows) {
        await recordCustodyEvent(client, {
          specimenId: member.specimen_id,
          eventId: receiptKey + ':' + member.specimen_id,
          actorId: offer.sender_user_id, role: 'collector', action: 'dispatch',
          expectedVersion: member.expected_version,
          recipientId: offer.courier_user_id,
          // Verified by this request's signed courier identity and current staff row.
          recipientAcknowledged: true
        });
      }
      await client.query(
        "UPDATE phase3_handoff_offers SET status='received',receipt_key=$2,received_at=now() WHERE id=$1",
        [offerId, receiptKey]);
      await client.query(
        "UPDATE phase3_assignments SET status='completed' WHERE id=$1",
        [offer.assignment_id]);
      await client.query(
        "UPDATE orders SET status='collected',updated_at=now() WHERE id=$1", [offer.order_id]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        "VALUES($1,'phase3.courier_handoff.acknowledged','handoff',$2,$3::jsonb)",
        [offer.courier_user_id, offerId, JSON.stringify({ specimenCount: members.rows.length })]);
      await client.query('COMMIT');
      return { data: { id: offerId, status: 'received', specimenCount: members.rows.length, replayed: false } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof CustodyConflict) throw new ConflictException(error.code);
      if (error && typeof error === 'object' && 'code' in error &&
          (error as { code: unknown }).code === '23505') throw new ConflictException('Receipt key already used');
      throw error;
    } finally { client.release(); }
  }
}

@Controller('field')
@UseGuards(IdentityGuard)
export class Phase3HandoffController {
  constructor(private readonly service: Phase3HandoffService) {}
  @Get('handoff-offers')
  list(@Req() req: AuthenticatedRequest) {
    if (!req.identity) throw new ForbiddenException();
    return this.service.listForCourier(req.identity);
  }
  @Post('assignments/:id/handoff-offers')
  offer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid handoff request');
    const data = body as Record<string, unknown>;
    if (typeof data.courierStaffId !== 'string' || !uuid.test(data.courierStaffId) ||
        typeof data.requestKey !== 'string' || !uuid.test(data.requestKey))
      throw new BadRequestException('Invalid handoff request');
    return this.service.offer(req.identity,id.toLowerCase(),
      data.courierStaffId.toLowerCase(),data.requestKey.toLowerCase());
  }
  @Post('handoff-offers/:id/ack')
  acknowledge(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid courier acknowledgment');
    const data = body as Record<string, unknown>;
    if (typeof data.receiptKey !== 'string' || !uuid.test(data.receiptKey))
      throw new BadRequestException('Invalid courier acknowledgment');
    return this.service.acknowledge(req.identity,id.toLowerCase(),data.receiptKey.toLowerCase());
  }
}
