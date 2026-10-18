import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
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
  async report(identity: AuthenticatedIdentity, specimenId: string, kind: string) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'specimens:collect');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO phase3_incidents(specimen_id,reporter_id,kind)
       SELECT sp.id, usr.id, $3 FROM specimens sp
       JOIN orders ord ON ord.id=sp.order_id
       JOIN phase3_assignments a ON a.order_id=ord.id
       JOIN staff st ON st.id=a.staff_id
       JOIN users usr ON usr.id=st.user_id
       WHERE sp.id=$1 AND usr.identity_subject=$2 AND st.active
         AND a.status IN ('assigned','arrived','collecting')
       RETURNING id`, [specimenId, identity.subject, kind]);
    if (result.rowCount !== 1) throw new ForbiddenException('Specimen access denied');
    return { data: { id: result.rows[0]!.id, status: 'open' } };
  }
  async list(identity: AuthenticatedIdentity) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      "SELECT id,specimen_id,assignment_id,kind,created_at FROM phase3_incidents WHERE resolution_status='open' ORDER BY created_at LIMIT 100"
    );
    return { data: result.rows };
  }
  async resolve(identity: AuthenticatedIdentity, incidentId: string, note: string) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      `UPDATE phase3_incidents i SET resolution_status='resolved',resolved_at=now(),
       resolved_by=usr.id,resolution_note=$3
       FROM users usr WHERE i.id=$1 AND usr.identity_subject=$2
       AND i.resolution_status='open' RETURNING i.id`,
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
    const kind = (body as Record<string, unknown>).kind;
    if (typeof kind !== 'string' || !/^[a-z_]{3,64}$/.test(kind)) throw new BadRequestException('Invalid incident');
    return this.service.report(req.identity, id, kind);
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
