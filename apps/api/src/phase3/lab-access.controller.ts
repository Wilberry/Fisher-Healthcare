import { ApiBearerAuth } from '@nestjs/swagger';
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Injectable, OnModuleDestroy, Param, Post, Req, ServiceUnavailableException,
  UseGuards
} from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
import { requirePhase3SyntheticMode } from './phase3-mode';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class Phase3LabAccessService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({
      connectionString: process.env.DATABASE_URL, max: 3
    });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  private async administrator(subject: string, client: import('pg').PoolClient): Promise<string> {
    const actor = await client.query<{ id: string }>(
      'SELECT usr.id FROM users usr JOIN staff st ON st.user_id=usr.id ' +
      "WHERE usr.identity_subject=$1 AND st.active AND st.role='administrator' FOR UPDATE OF st",
      [subject]);
    if (actor.rowCount !== 1) throw new ForbiddenException('Active administrator required');
    return actor.rows[0]!.id;
  }
  private async authorize(identity: AuthenticatedIdentity) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'staff:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    return this.pool.connect();
  }
  async requests(identity: AuthenticatedIdentity) {
    const client = await this.authorize(identity);
    try {
      await client.query('BEGIN READ ONLY');
      await this.administrator(identity.subject,client);
      const rows = await client.query(
        'SELECT req.id,req.lab_id,req.staff_id,req.reason,req.status,req.created_at, ' +
        'req.requested_by,req.reviewed_at FROM phase3_lab_access_requests req ' +
        "WHERE req.status='pending' ORDER BY req.created_at,req.id LIMIT 100");
      await client.query('COMMIT');
      return { data:rows.rows };
    } catch(error) { await client.query('ROLLBACK');throw error; }
    finally { client.release(); }
  }
  async grants(identity: AuthenticatedIdentity) {
    const client = await this.authorize(identity);
    try {
      await client.query('BEGIN READ ONLY');
      await this.administrator(identity.subject,client);
      const rows = await client.query(
        'SELECT scoped.lab_id,scoped.staff_id,scoped.granted_at ' +
        'FROM phase3_lab_staff_access scoped JOIN laboratories lab ON lab.id=scoped.lab_id ' +
        'JOIN staff st ON st.id=scoped.staff_id ' +
        "WHERE scoped.active AND scoped.revoked_at IS NULL AND lab.active AND st.active " +
        'ORDER BY scoped.granted_at DESC,scoped.lab_id,scoped.staff_id LIMIT 100');
      await client.query('COMMIT');
      return { data:rows.rows };
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }

  async request(identity: AuthenticatedIdentity, labId: string, staffId: string, reason: string) {
    const client = await this.authorize(identity);
    try {
      await client.query('BEGIN');
      const requester = await this.administrator(identity.subject, client);
      const target = await client.query(
        'SELECT 1 FROM laboratories lab CROSS JOIN staff st ' +
        "WHERE lab.id=$1 AND lab.active AND st.id=$2 AND st.active AND st.role='lab_coordinator' " +
        'FOR UPDATE OF lab,st', [labId,staffId]);
      if (target.rowCount !== 1) throw new ForbiddenException('Lab or coordinator not eligible');
      const result = await client.query<{ id: string }>(
        'INSERT INTO phase3_lab_access_requests(lab_id,staff_id,requested_by,reason) ' +
        'VALUES($1,$2,$3,$4) RETURNING id', [labId,staffId,requester,reason]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id) ' +
        "VALUES($1,'phase3.lab_access.requested','lab_access_request',$2)",
        [requester,result.rows[0]!.id]);
      await client.query('COMMIT');
      return { data:{ id:result.rows[0]!.id, status:'pending' } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error &&
          (error as {code:unknown}).code === '23505')
        throw new ConflictException('Pending lab access request already exists');
      throw error;
    } finally { client.release(); }
  }
  async approve(identity: AuthenticatedIdentity, requestId: string) {
    const client = await this.authorize(identity);
    try {
      await client.query('BEGIN');
      const reviewer = await this.administrator(identity.subject,client);
      const pending = await client.query<{
        lab_id:string; staff_id:string; requested_by:string; status:string
      }>(
        'SELECT lab_id,staff_id,requested_by,status FROM phase3_lab_access_requests ' +
        'WHERE id=$1 FOR UPDATE', [requestId]);
      const request = pending.rows[0];
      if (!request || request.status !== 'pending') throw new ConflictException('Grant request unavailable');
      if (request.requested_by === reviewer)
        throw new ForbiddenException('A second administrator must approve this request');
      const current = await client.query(
        'SELECT 1 FROM laboratories lab CROSS JOIN staff st ' +
        "WHERE lab.id=$1 AND lab.active AND st.id=$2 AND st.active AND st.role='lab_coordinator' " +
        'FOR UPDATE OF lab,st', [request.lab_id,request.staff_id]);
      if (current.rowCount !== 1) throw new ConflictException('Lab or coordinator no longer eligible');
      await client.query(
        'INSERT INTO phase3_lab_staff_access(lab_id,staff_id,active,granted_by,granted_at,revoked_at) ' +
        'VALUES($1,$2,true,$3,now(),NULL) ' +
        'ON CONFLICT(lab_id,staff_id) DO UPDATE SET ' +
        'active=true,granted_by=EXCLUDED.granted_by,granted_at=now(),revoked_at=NULL',
        [request.lab_id,request.staff_id,reviewer]);
      await client.query(
        "UPDATE phase3_lab_access_requests SET status='approved',reviewed_by=$2,reviewed_at=now() " +
        "WHERE id=$1 AND status='pending'", [requestId,reviewer]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        "VALUES($1,'phase3.lab_access.approved','lab_access_request',$2,$3::jsonb)",
        [reviewer,requestId,JSON.stringify({labId:request.lab_id,staffId:request.staff_id})]);
      await client.query('COMMIT');
      return { data:{id:requestId,status:'approved'} };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async revoke(identity: AuthenticatedIdentity, labId: string, staffId: string) {
    const client = await this.authorize(identity);
    try {
      await client.query('BEGIN');
      const actor = await this.administrator(identity.subject,client);
      const grant = await client.query(
        'UPDATE phase3_lab_staff_access SET active=false,revoked_at=now() ' +
        'WHERE lab_id=$1 AND staff_id=$2 AND active AND revoked_at IS NULL',
        [labId,staffId]);
      if (grant.rowCount !== 1) throw new ConflictException('Active lab access not found');
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        "VALUES($1,'phase3.lab_access.revoked','laboratory',$2,$3::jsonb)",
        [actor,labId,JSON.stringify({staffId})]);
      await client.query('COMMIT');
      return {data:{labId,staffId,status:'revoked'}};
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {client.release();}
  }
}

@ApiBearerAuth()
@UseGuards(IdentityGuard)
@Controller('ops/labs')
export class Phase3LabAccessController {
  constructor(private readonly service: Phase3LabAccessService) {}
  @Get('access-requests')
  requests(@Req() req: AuthenticatedRequest) {
    if (!req.identity) throw new ForbiddenException();
    return this.service.requests(req.identity);
  }
  @Get('access')
  grants(@Req() req: AuthenticatedRequest) {
    if (!req.identity) throw new ForbiddenException();
    return this.service.grants(req.identity);
  }
  @Post('access-requests')
  request(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!req.identity || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid lab grant request');
    const b = body as Record<string,unknown>;
    if (typeof b.labId !== 'string' || !uuid.test(b.labId) ||
        typeof b.staffId !== 'string' || !uuid.test(b.staffId) ||
        typeof b.reason !== 'string' || b.reason.trim().length < 10 ||
        b.reason.length > 240) throw new BadRequestException('Invalid lab grant request');
    return this.service.request(req.identity,b.labId.toLowerCase(),b.staffId.toLowerCase(),b.reason.trim());
  }
  @Post('access-requests/:id/approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id') id:string) {
    if (!req.identity || !uuid.test(id)) throw new BadRequestException('Invalid review');
    return this.service.approve(req.identity,id.toLowerCase());
  }
  @Post('access/:labId/staff/:staffId/revoke')
  revoke(@Req() req: AuthenticatedRequest, @Param('labId') labId:string,
    @Param('staffId') staffId:string) {
    if (!req.identity || !uuid.test(labId) || !uuid.test(staffId))
      throw new BadRequestException('Invalid revocation');
    return this.service.revoke(req.identity,labId.toLowerCase(),staffId.toLowerCase());
  }
}
