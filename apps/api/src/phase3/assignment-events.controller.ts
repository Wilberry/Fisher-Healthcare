import { ApiBearerAuth } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import {
  BadRequestException, Body, Controller, Param, Post, Req, UseGuards,
  Injectable, OnModuleDestroy, ServiceUnavailableException, ForbiddenException, ConflictException
} from '@nestjs/common';
import { Pool } from 'pg';
import { requirePhase3SyntheticMode } from './phase3-mode';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
import {
  advanceAssignment, AssignmentConflict, fieldFailureCodes,
  type AssignmentCommand, type FieldAssignmentAction, type FieldAssignmentStatus
} from './assignment-policy';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Receipt = { eventId: string; assignmentId: string; status: string; version: number };

@Injectable()
export class Phase3AssignmentEventsService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({
      connectionString: process.env.DATABASE_URL, max: 3
    });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  async apply(identity: AuthenticatedIdentity, assignmentId: string, eventId: string, command: AssignmentCommand) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'specimens:collect');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order first: same order->assignment order as courier handoff.
      const referenced = await client.query<{ order_id: string }>(
        'SELECT order_id FROM phase3_assignments WHERE id=$1', [assignmentId]);
      if (!referenced.rows[0]) throw new ForbiddenException('Assignment access denied');
      const orderId = referenced.rows[0].order_id;
      const order = await client.query<{ status: string }>(
        'SELECT status FROM orders WHERE id=$1 FOR UPDATE', [orderId]);
      const assignment = await client.query<{
        status: FieldAssignmentStatus; event_version: number; user_id: string
      }>(
        'SELECT a.status,a.event_version,st.user_id FROM phase3_assignments a ' +
        'JOIN staff st ON st.id=a.staff_id JOIN users usr ON usr.id=st.user_id ' +
        "WHERE a.id=$1 AND a.order_id=$3 AND usr.identity_subject=$2 " +
        "AND st.active AND st.role='phlebotomist' FOR UPDATE OF a",
        [assignmentId,identity.subject,orderId]);
      const assigned = assignment.rows[0];
      if (!assigned) throw new ForbiddenException('Assignment access denied');
      const fingerprint = createHash('sha256').update(JSON.stringify([
        assignmentId,eventId,assigned.user_id,command.action,command.expectedVersion,
        command.failureCode ?? null
      ])).digest('hex');
      const previous = await client.query<{ fingerprint: string; receipt: Receipt }>(
        'SELECT fingerprint,receipt FROM phase3_assignment_event_receipts WHERE event_id=$1',
        [eventId]);
      if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== fingerprint) {
          throw new ConflictException('ASSIGNMENT_EVENT_ID_REUSED');
        }
        await client.query('COMMIT');
        return { data: { ...previous.rows[0].receipt, replayed: true } };
      }
      const next = advanceAssignment(
        { status: assigned.status,version: assigned.event_version },command);
      if (!['assigned','collection_in_progress'].includes(order.rows[0]?.status ?? '')) {
        throw new ConflictException('Order no longer permits field events');
      }
      const changed = await client.query(
        'UPDATE phase3_assignments SET status=$2,event_version=$3,last_updated_at=now(),' +
        'failure_reason_code=$4 WHERE id=$1 AND event_version=$5',
        [assignmentId,next.status,next.version,command.failureCode ?? null,assigned.event_version]);
      if (changed.rowCount !== 1) throw new ConflictException('STALE_ASSIGNMENT_VERSION');
      if (next.status === 'collecting' || next.status === 'failed') {
        const status = next.status === 'failed' ? 'exception' : 'collection_in_progress';
        await client.query('UPDATE orders SET status=$2,updated_at=now() WHERE id=$1',
          [orderId,status]);
      }
      if (next.status === 'failed') {
        await client.query(
          'INSERT INTO phase3_incidents(assignment_id,reporter_id,client_event_id,kind,details) ' +
          "VALUES($1,$2,$3,'collection_failed',$4::jsonb)",
          [assignmentId,assigned.user_id,eventId,JSON.stringify({ reasonCode:command.failureCode })]);
      }
      const receipt: Receipt = { eventId, assignmentId, status:next.status, version:next.version };
      await client.query(
        'INSERT INTO phase3_assignment_event_receipts(event_id,assignment_id,actor_id,action,fingerprint,receipt) ' +
        'VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [eventId,assignmentId,assigned.user_id,command.action,fingerprint,JSON.stringify(receipt)]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        'VALUES($1,$2,$3,$4,$5::jsonb)',
        [assigned.user_id,'phase3.assignment.'+command.action,'assignment',assignmentId,
          JSON.stringify({ version:next.version,reasonCode:command.failureCode ?? null })]);
      await client.query('COMMIT');
      return { data: { ...receipt,replayed:false } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof AssignmentConflict) throw new ConflictException(error.code);
      if (error && typeof error === 'object' && 'code' in error &&
          (error as { code: unknown }).code === '23505') {
        throw new ConflictException('Assignment event already exists');
      }
      throw error;
    } finally { client.release(); }
  }
}

@Controller('field/assignments')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase3AssignmentEventsController {
  constructor(private readonly service: Phase3AssignmentEventsService) {}
  @Post(':id/events')
  apply(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid assignment event');
    const b = body as Record<string, unknown>;
    if (typeof b.eventId !== 'string' || !uuid.test(b.eventId) ||
        !['arrive','start_collection','fail'].includes(String(b.action)) ||
        !Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0 ||
        (b.failureCode !== undefined &&
         (typeof b.failureCode !== 'string' || !fieldFailureCodes.some(code => code === b.failureCode)))) {
      throw new BadRequestException('Invalid assignment event');
    }
    const cmd: AssignmentCommand = {
      action:b.action as FieldAssignmentAction,
      expectedVersion:b.expectedVersion as number,
      ...(b.failureCode !== undefined ? {failureCode:b.failureCode as string} : {})
    };
    return this.service.apply(req.identity,id.toLowerCase(),b.eventId.toLowerCase(),cmd);
  }
}
