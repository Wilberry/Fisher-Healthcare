import { Controller, Get, Param, Req, UseGuards, BadRequestException, ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { requirePhase3SyntheticMode } from './phase3-mode';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa } from '../identity';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class Phase3FieldAssignmentsService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  async onModuleDestroy() { await this.pool?.end(); }
  async list(subject: string, id?: string) {
    requirePhase3SyntheticMode();
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      `SELECT a.id,a.order_id,a.status,ord.collection_window_start,ord.collection_window_end
       FROM phase3_assignments a
       JOIN staff st ON st.id=a.staff_id
       JOIN users usr ON usr.id=st.user_id
       JOIN orders ord ON ord.id=a.order_id
       WHERE usr.identity_subject=$1 AND st.active=TRUE AND st.role='phlebotomist'
         AND a.status IN ('assigned','arrived','collecting')
         AND ($2::uuid IS NULL OR a.id=$2::uuid)
       ORDER BY ord.collection_window_start ASC LIMIT 100`, [subject, id ?? null]
    );
    if (id && result.rowCount !== 1) throw new ForbiddenException('Assignment access denied');
    if (!id) return { data: result.rows };
    const assigned = result.rows[0] as { order_id: string };
    // The assignment identity/role check above precedes this minimal specimen read.
    // Never include patient contact information, lab results or other assignments.
    const specimens = await this.pool.query(
      'SELECT id,barcode,status,custody_version FROM specimens ' +
      'WHERE order_id=$1 ORDER BY id LIMIT 100', [assigned.order_id]);
    return { data: { ...assigned, specimens: specimens.rows } };
  }
}
@Controller('field/assignments')
@UseGuards(IdentityGuard)
export class Phase3FieldAssignmentsController {
  constructor(private readonly service: Phase3FieldAssignmentsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    if (!req.identity) throw new ForbiddenException();
    requireStaffMfa(req.identity);
    return this.service.list(req.identity.subject);
  }
  @Get(':id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (!req.identity) throw new ForbiddenException();
    requireStaffMfa(req.identity);
    if (!uuid.test(id)) throw new BadRequestException('Invalid assignment');
    return this.service.list(req.identity.subject, id);
  }
}
