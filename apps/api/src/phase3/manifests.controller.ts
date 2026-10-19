import { BadRequestException, Body, Controller, Post, Param, Req, UseGuards, Injectable, OnModuleDestroy, ServiceUnavailableException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { requirePhase3SyntheticMode } from './phase3-mode';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
import { CustodyConflict, transitionCustody } from './custody';
import { normalizeManifestDisposition, sameDisposition, receiptRejectionCodes, type ManifestDisposition } from './manifest-policy';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class Phase3ManifestService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  async onModuleDestroy() { await this.pool?.end(); }
  async prepare(identity: AuthenticatedIdentity, labId: string, specimenIds: string[]) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const valid = await client.query(
        `SELECT sp.id FROM specimens sp JOIN orders ord ON ord.id=sp.order_id
         JOIN laboratories lab ON lab.id=ord.lab_id
         WHERE sp.id=ANY($1::uuid[]) AND ord.lab_id=$2 AND ord.status='collected' AND lab.active
         AND sp.status='in_transit' AND NOT EXISTS (SELECT 1 FROM phase3_manifest_specimens ms WHERE ms.specimen_id=sp.id)
         AND NOT EXISTS (SELECT 1 FROM phase3_incidents inc WHERE inc.specimen_id=sp.id AND inc.resolution_status='open') ORDER BY sp.id FOR UPDATE OF sp`, [specimenIds, labId]);
      if (valid.rowCount !== specimenIds.length) throw new ConflictException('Manifest specimens not eligible');
      const manifest = await client.query<{ id: string }>(
        `INSERT INTO phase3_lab_manifests(lab_id,created_by)
         SELECT $1,usr.id FROM users usr WHERE usr.identity_subject=$2 RETURNING id`,
        [labId, identity.subject]);
      if (manifest.rowCount !== 1) throw new ForbiddenException();
      const id = manifest.rows[0]!.id;
      await client.query(
        `INSERT INTO phase3_manifest_specimens(manifest_id,specimen_id)
         SELECT $1,unnest($2::uuid[])`, [id, specimenIds]);
      await client.query('COMMIT');
      return { data: { id, status: 'prepared', specimenCount: specimenIds.length } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async receive(identity: AuthenticatedIdentity, manifestId: string, receiptKey: string,
    acceptedIds: string[], rejectedIds: string[], rejectionCode?: string) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'labs:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const receiver = await client.query<{ id: string }>(
        "SELECT usr.id FROM users usr JOIN staff st ON st.user_id=usr.id " +
        "WHERE usr.identity_subject=$1 AND st.active AND st.role='lab_coordinator'",
        [identity.subject]);
      if (receiver.rowCount !== 1) throw new ForbiddenException('Receiving lab staff not authorized');
      const actorId = receiver.rows[0]!.id;
      // One manifest row lock fences concurrent handoffs and receipt-key retries.
      const manifest = await client.query<{ status: string }>(
        'SELECT status FROM phase3_lab_manifests WHERE id=$1 FOR UPDATE', [manifestId]);
      if (!manifest.rows[0]) throw new ConflictException('Manifest unavailable');
      const members = await client.query<{ id: string; status: string; custody_version: number }>(
        'SELECT sp.id,sp.status,sp.custody_version ' +
        'FROM phase3_manifest_specimens ms JOIN specimens sp ON sp.id=ms.specimen_id ' +
        'WHERE ms.manifest_id=$1 ORDER BY sp.id FOR UPDATE OF sp', [manifestId]);
      // A newly reported unresolved incident can stop laboratory receipt even
      // after manifest preparation. Receipts never bypass exception review.
      const unresolved = await client.query(
        "SELECT 1 FROM phase3_incidents WHERE specimen_id=ANY($1::uuid[]) " +
        "AND resolution_status='open' LIMIT 1", [members.rows.map(member => member.id)]);
      if (unresolved.rowCount) throw new ConflictException('Open specimen incident blocks lab receipt');
      const disposition = normalizeManifestDisposition(
        members.rows.map(member => member.id), acceptedIds, rejectedIds, rejectionCode);
      const existing = await client.query<{
        receipt_key: string; accepted_specimen_ids: string[];
        rejected_specimen_ids: string[]; rejection_reason_code: string | null
      }>('SELECT receipt_key,accepted_specimen_ids,rejected_specimen_ids,rejection_reason_code ' +
         'FROM phase3_manifest_receipts WHERE manifest_id=$1', [manifestId]);
      if (manifest.rows[0].status !== 'prepared') {
        const record = existing.rows[0];
        const prior: ManifestDisposition | null = record ? {
          accepted: [...record.accepted_specimen_ids].sort(),
          rejected: [...record.rejected_specimen_ids].sort(),
          rejectionCode: record.rejection_reason_code as ManifestDisposition['rejectionCode']
        } : null;
        if (record?.receipt_key === receiptKey && prior && sameDisposition(disposition, prior)) {
          await client.query('COMMIT');
          return { data: { id: manifestId, status: manifest.rows[0].status, replayed: true } };
        }
        throw new ConflictException('Manifest receipt already finalized');
      }
      if (existing.rowCount !== 0 || members.rows.some(member => member.status !== 'in_transit')) {
        throw new ConflictException('Manifest custody state has changed');
      }
      const accepted = new Set(disposition.accepted);
      for (const member of members.rows) {
        const received = transitionCustody(
          { state: 'in_transit', version: member.custody_version },
          { specimenId: member.id, eventId: receiptKey + ':receive:' + member.id,
            actorId, role: 'lab_staff', action: 'receive_at_lab',
            expectedVersion: member.custody_version,
            recipientId: actorId, recipientAcknowledged: true }
        );
        await client.query('UPDATE specimens SET status=$2,custody_version=$3,updated_at=now() WHERE id=$1',
          [member.id, received.state, received.version]);
        await client.query(
          'INSERT INTO custody_events(specimen_id,actor_id,event_type,payload,occurred_at) ' +
          "VALUES($1,$2,'receive_at_lab',$3::jsonb,now())",
          [member.id, actorId, JSON.stringify({
            manifestId, receiptKey, custodyVersion: received.version, authenticatedLabReceiver: true
          })]);
        if (!accepted.has(member.id)) {
          const declined = transitionCustody(received,
            { specimenId: member.id, eventId: receiptKey + ':reject:' + member.id,
              actorId, role: 'lab_staff', action: 'reject', expectedVersion: received.version });
          await client.query('UPDATE specimens SET status=$2,custody_version=$3,updated_at=now() WHERE id=$1',
            [member.id, declined.state, declined.version]);
          await client.query(
            'INSERT INTO custody_events(specimen_id,actor_id,event_type,payload,occurred_at) ' +
            "VALUES($1,$2,'reject',$3::jsonb,now())",
            [member.id, actorId, JSON.stringify({
              manifestId, receiptKey, custodyVersion: declined.version,
              reasonCode: disposition.rejectionCode
            })]);
        }
      }
      const status = disposition.rejected.length ? 'disputed' : 'received';
      await client.query(
        'INSERT INTO phase3_manifest_receipts(manifest_id,receipt_key,received_by,' +
        'accepted_specimen_ids,rejected_specimen_ids,rejection_reason_code) ' +
        'VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
        [manifestId, receiptKey, actorId,
          JSON.stringify(disposition.accepted), JSON.stringify(disposition.rejected),
          disposition.rejectionCode]);
      await client.query(
        'UPDATE phase3_lab_manifests SET status=$2,received_at=now(),received_by=$3 WHERE id=$1',
        [manifestId, status, actorId]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        "VALUES($1,'phase3.lab_manifest.received','lab_manifest',$2,$3::jsonb)",
        [actorId, manifestId, JSON.stringify({
          receivedCount: disposition.accepted.length, rejectedCount: disposition.rejected.length, status
        })]);
      await client.query('COMMIT');
      return { data: { id: manifestId, status, replayed: false } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof CustodyConflict) throw new ConflictException(error.code);
      if (error && typeof error === 'object' && 'code' in error &&
          (error as { code: unknown }).code === '23505') {
        throw new ConflictException('Duplicate manifest or receipt');
      }
      throw error;
    } finally { client.release(); }
  }
}
@Controller('ops/lab-manifests')
@UseGuards(IdentityGuard)
export class Phase3ManifestController {
  constructor(private readonly service: Phase3ManifestService) {}
  @Post()
  prepare(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!req.identity || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid manifest');
    const b = body as Record<string, unknown>;
    if (typeof b.labId !== 'string' || !uuid.test(b.labId) ||
        !Array.isArray(b.specimenIds) || b.specimenIds.length < 1 || b.specimenIds.length > 100 ||
        !b.specimenIds.every(id => typeof id === 'string' && uuid.test(id)) ||
        new Set(b.specimenIds.map((id: string) => id.toLowerCase())).size !== b.specimenIds.length) throw new BadRequestException('Invalid manifest');
    return this.service.prepare(req.identity, b.labId.toLowerCase(), b.specimenIds.map((id: string) => id.toLowerCase()));
  }
  @Post(':id/receipt')
  receive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid receipt');
    const b = body as Record<string, unknown>;
    if (typeof b.receiptKey !== 'string' || !uuid.test(b.receiptKey) ||
        !Array.isArray(b.acceptedIds) || !Array.isArray(b.rejectedIds) ||
        b.acceptedIds.length + b.rejectedIds.length > 100 ||
        ![...b.acceptedIds,...b.rejectedIds].every(x => typeof x === 'string' && uuid.test(x)) ||
        (b.rejectionCode !== undefined &&
          (typeof b.rejectionCode !== 'string' || !receiptRejectionCodes.some(code => code === b.rejectionCode))))
      throw new BadRequestException('Invalid receipt');
    return this.service.receive(req.identity, id.toLowerCase(), b.receiptKey.toLowerCase(),
      b.acceptedIds.map((value: string) => value.toLowerCase()),
      b.rejectedIds.map((value: string) => value.toLowerCase()),
      b.rejectionCode as string | undefined);
  }
}
