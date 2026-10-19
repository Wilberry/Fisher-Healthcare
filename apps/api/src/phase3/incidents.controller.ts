import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { requirePhase3SyntheticMode } from './phase3-mode';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class Phase3IncidentsService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  async onModuleDestroy() { await this.pool?.end(); }
  async report(identity: AuthenticatedIdentity, specimenId: string, eventId: string, kind: string) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    const capabilities = await this.access.staffCapabilities(identity.subject);
    if (!capabilities.includes('specimens:collect') &&
        !capabilities.includes('specimens:transport')) {
      throw new ForbiddenException('Incident reporting not permitted');
    }
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reporter = await client.query<{ id: string }>(
        'SELECT usr.id FROM users usr JOIN staff st ON st.user_id=usr.id ' +
        'JOIN specimens sp ON sp.id=$2 ' +
        'WHERE usr.identity_subject=$1 AND st.active AND (' +
        " (st.role='phlebotomist' AND EXISTS (" +
        '   SELECT 1 FROM phase3_assignments a WHERE a.order_id=sp.order_id ' +
        "   AND a.staff_id=st.id AND a.status IN ('assigned','arrived','collecting')" +
        ' )) OR ' +
        " (st.role='courier' AND sp.status='in_transit' AND EXISTS (" +
        '   SELECT 1 FROM phase3_handoff_offers h ' +
        '   JOIN phase3_handoff_specimens hs ON hs.offer_id=h.id ' +
        "   WHERE hs.specimen_id=sp.id AND h.courier_staff_id=st.id AND h.status='received'" +
        ' ))) FOR UPDATE OF st,sp',
        [identity.subject, specimenId]);
      if (reporter.rowCount !== 1) throw new ForbiddenException('Specimen incident access denied');
      const actorId = reporter.rows[0]!.id;
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO phase3_incidents(specimen_id,reporter_id,client_event_id,kind) ' +
        'VALUES($1,$2,$3,$4) ON CONFLICT(client_event_id) DO NOTHING RETURNING id',
        [specimenId,actorId,eventId,kind]);
      if (inserted.rows[0]) {
        await client.query('COMMIT');
        return { data: { id: inserted.rows[0].id, status: 'open', replayed: false } };
      }
      const prior = await client.query<{
        id: string; specimen_id: string; reporter_id: string;
        kind: string; resolution_status: string
      }>('SELECT id,specimen_id,reporter_id,kind,resolution_status ' +
         'FROM phase3_incidents WHERE client_event_id=$1', [eventId]);
      const old = prior.rows[0];
      if (!old || old.specimen_id !== specimenId || old.reporter_id !== actorId || old.kind !== kind) {
        throw new ConflictException('Incident event identity reused for different content');
      }
      await client.query('COMMIT');
      return { data: { id: old.id, status: old.resolution_status, replayed: true } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async list(identity: AuthenticatedIdentity) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      "SELECT id,specimen_id,assignment_id,kind,created_at FROM phase3_incidents WHERE resolution_status='open' ORDER BY created_at LIMIT 100"
    );
    return { data: result.rows };
  }
  async resolve(identity: AuthenticatedIdentity, incidentId: string, note: string) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      "WITH resolved AS (" +
      " UPDATE phase3_incidents i SET resolution_status='resolved',resolved_at=now()," +
      " resolved_by=usr.id,resolution_note=$3" +
      " FROM users usr WHERE i.id=$1 AND usr.identity_subject=$2" +
      " AND i.resolution_status='open' RETURNING i.id,i.resolved_by" +
      ") INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)" +
      " SELECT resolved_by,'phase3.incident.resolved','incident',id,'{}'::jsonb FROM resolved" +
      " RETURNING resource_id",
      [incidentId, identity.subject, note]);
    if (result.rowCount !== 1) throw new ConflictException('Incident unavailable');
    return { data: { id: incidentId, status: 'resolved' } };
  }
}
@Controller()
@UseGuards(IdentityGuard)
export class Phase3IncidentsController {
  constructor(private readonly service: Phase3IncidentsService) {}
  @Post('field/specimens/:id/incident')
  report(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid incident');
    const b = body as Record<string, unknown>;
    if (typeof b.kind !== 'string' || !/^[a-z_]{3,64}$/.test(b.kind) ||
        typeof b.eventId !== 'string' || !uuid.test(b.eventId))
      throw new BadRequestException('Invalid incident');
    return this.service.report(req.identity, id.toLowerCase(), b.eventId.toLowerCase(), b.kind);
  }
  @Get('ops/exceptions')
  list(@Req() req: AuthenticatedRequest) {
    if (!req.identity) throw new ForbiddenException();
    return this.service.list(req.identity);
  }
  @Post('ops/exceptions/:id/resolve')
  resolve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid resolution');
    const note = (body as Record<string, unknown>).note;
    if (typeof note !== 'string' || note.trim().length < 8 || note.length > 2000)
      throw new BadRequestException('Invalid resolution');
    return this.service.resolve(req.identity, id, note.trim());
  }
}
