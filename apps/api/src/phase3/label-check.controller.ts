import { createHash } from 'node:crypto';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  BadRequestException, Body, Controller, ForbiddenException, Post, Param, Req, UseGuards,
  Injectable, OnModuleDestroy, ConflictException, ServiceUnavailableException
} from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
import { requirePhase3SyntheticMode } from './phase3-mode';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface LabelCheckInput { eventId:string; observedBarcode:string; expectedVersion:number }

@Injectable()
export class Phase3LabelService implements OnModuleDestroy {
  private readonly pool?:Pool;
  constructor(private readonly access:AccessService) {
    if (process.env.DATABASE_URL) this.pool=new Pool({
      connectionString:process.env.DATABASE_URL,max:3
    });
  }
  async onModuleDestroy(){await this.pool?.end();}
  async verify(identity:AuthenticatedIdentity,specimenId:string,input:LabelCheckInput) {
    requirePhase3SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'specimens:collect');
    if(!this.pool)throw new ServiceUnavailableException('Data service unavailable');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const reference=await client.query<{order_id:string}>(
        'SELECT order_id FROM specimens WHERE id=$1',[specimenId]);
      if(!reference.rows[0])throw new ForbiddenException('Specimen access denied');
      const order=await client.query<{status:string}>(
        'SELECT status FROM orders WHERE id=$1 FOR UPDATE',[reference.rows[0].order_id]);
      if(order.rows[0]?.status!=='collection_in_progress')
        throw new ForbiddenException('Collection is not active');
      const specimen=await client.query<{
        id:string;barcode:string;status:string;custody_version:number
      }>(
        'SELECT id,barcode,status,custody_version FROM specimens WHERE id=$1 FOR UPDATE',
        [specimenId]);
      if(!specimen.rows[0])throw new ForbiddenException('Specimen access denied');
      const authorized=await client.query<{id:string}>(
        'SELECT usr.id FROM users usr JOIN staff st ON st.user_id=usr.id ' +
        'JOIN phase3_assignments a ON a.staff_id=st.id ' +
        'WHERE usr.identity_subject=$1 AND a.order_id=$2 AND st.active ' +
        "AND st.role='phlebotomist' AND a.status='collecting' LIMIT 1",
        [identity.subject,reference.rows[0].order_id]);
      if(authorized.rowCount!==1)throw new ForbiddenException('Specimen access denied');
      const actorId=authorized.rows[0]!.id;
      const hash=createHash('sha256').update(input.observedBarcode,'utf8').digest('hex');
      const previous=await client.query<{
        event_id:string;checked_by:string;expected_version:number;barcode_fingerprint:string
      }>(
        'SELECT event_id,checked_by,expected_version,barcode_fingerprint ' +
        'FROM phase3_specimen_label_checks WHERE specimen_id=$1',[specimenId]);
      const earlier=previous.rows[0];
      if(earlier){
        if(earlier.event_id===input.eventId && earlier.checked_by===actorId &&
           earlier.expected_version===input.expectedVersion &&
           earlier.barcode_fingerprint===hash){
          await client.query('COMMIT');
          return {data:{specimenId,eventId:input.eventId,verified:true,replayed:true}};
        }
        throw new ConflictException('LABEL_ALREADY_CHECKED');
      }
      if(specimen.rows[0].status!=='planned' ||
         specimen.rows[0].custody_version!==input.expectedVersion)
        throw new ConflictException('STALE_SPECIMEN_LABEL_CHECK');
      if(specimen.rows[0].barcode!==input.observedBarcode)
        throw new ConflictException('LABEL_MISMATCH');
      await client.query(
        'INSERT INTO phase3_specimen_label_checks(' +
        'specimen_id,event_id,checked_by,expected_version,barcode_fingerprint) ' +
        'VALUES($1,$2,$3,$4,$5)',
        [specimenId,input.eventId,actorId,input.expectedVersion,hash]);
      await client.query(
        'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) ' +
        "VALUES($1,'phase3.specimen.label_verified','specimen',$2,$3::jsonb)",
        [actorId,specimenId,JSON.stringify({custodyVersion:input.expectedVersion,eventId:input.eventId})]);
      await client.query('COMMIT');
      return {data:{specimenId,eventId:input.eventId,verified:true,replayed:false}};
    }catch(error){
      await client.query('ROLLBACK');
      if(error && typeof error==='object' && 'code' in error &&
        (error as {code:unknown}).code==='23505')
        throw new ConflictException('LABEL_ALREADY_CHECKED');
      throw error;
    }finally{client.release();}
  }
}

@Controller('field/specimens')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase3LabelController {
  constructor(private readonly service:Phase3LabelService){}
  @Post(':id/label-check')
  verify(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
    if(!req.identity||!uuid.test(id)||!body||typeof body!=='object'||Array.isArray(body))
      throw new BadRequestException('Invalid label check');
    const b=body as Record<string,unknown>;
    if(typeof b.eventId!=='string'||!uuid.test(b.eventId)||
       typeof b.observedBarcode!=='string'||b.observedBarcode.length<1||
       b.observedBarcode.length>100||
       !/^[a-zA-Z0-9._-]+$/.test(b.observedBarcode)||
       !Number.isSafeInteger(b.expectedVersion)||(b.expectedVersion as number)<0)
      throw new BadRequestException('Invalid label check');
    return this.service.verify(req.identity,id.toLowerCase(),{
      eventId:b.eventId.toLowerCase(),observedBarcode:b.observedBarcode,
      expectedVersion:b.expectedVersion as number
    });
  }
}
