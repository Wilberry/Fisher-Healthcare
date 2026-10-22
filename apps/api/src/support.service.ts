import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import type { SupportCaseInput } from '@fisher/contracts';
import { AccessService } from './access.service';
import { type AuthenticatedIdentity,requireStaffMfa } from './identity';
@Injectable()
export class SupportService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});}
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Support unavailable');return this.pool;}
 async create(subject:string,input:SupportCaseInput,key:string){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic'||process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Customer assistance not activated');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const actor=await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[subject]);
    if(!actor.rows[0])throw new ForbiddenException('Account not provisioned');
    const actorId=actor.rows[0].id;
    if(input.bookingId){
     const accessible=await c.query(`SELECT 1 FROM orders o
       JOIN patient_relationships r ON r.patient_id=o.patient_id
       WHERE o.id=$1 AND r.user_id=$2 AND r.can_book
        AND r.verified_at IS NOT NULL AND r.revoked_at IS NULL FOR SHARE OF r`,
       [input.bookingId,actorId]);
     if(!accessible.rows.length)throw new NotFoundException('Booking unavailable');
    }
    const duplicate=await c.query<{id:string;category:string;preferred_contact:string;booking_id:string|null;status:string}>(
     'SELECT id,category,preferred_contact,booking_id,status FROM support_cases WHERE user_id=$1 AND idempotency_key=$2',
     [actorId,key]);
    if(duplicate.rows[0]){
     const old=duplicate.rows[0];
     if(old.category!==input.category || old.preferred_contact!==input.preferredContact ||
      old.booking_id!==(input.bookingId??null))throw new ConflictException('Idempotency key was used for another request');
     await c.query('COMMIT');
     return {caseId:old.id,status:old.status};
    }
    const row=await c.query<{id:string}>(`INSERT INTO support_cases(user_id,booking_id,category,preferred_contact,idempotency_key)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT (user_id,idempotency_key) DO NOTHING RETURNING id`,
     [actorId,input.bookingId??null,input.category,input.preferredContact,key]);
    if(!row.rows[0]){
     const prior=await c.query<{id:string;category:string;preferred_contact:string;booking_id:string|null;status:string}>(
      'SELECT id,category,preferred_contact,booking_id,status FROM support_cases WHERE user_id=$1 AND idempotency_key=$2',
      [actorId,key]);
     const old=prior.rows[0];
     if(!old || old.category!==input.category || old.preferred_contact!==input.preferredContact ||
       old.booking_id!==(input.bookingId??null))
      throw new ConflictException('Idempotency key collision');
     await c.query('COMMIT');
     return {caseId:old.id,status:old.status};
    }
    const id=row.rows[0].id;
    await c.query('INSERT INTO outbox(event_type,payload) VALUES($1,$2::jsonb)',
      ['support.case_opened',JSON.stringify({caseId:id})]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
      VALUES($1,'support.case_opened','support_case',$2)`,[actorId,id]);
    await c.query('COMMIT');
    return {caseId:id,status:'open'};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
 async list(subject:string){
  const result=await this.db.query(`SELECT s.id,s.booking_id,s.category,s.preferred_contact,
    s.status,s.created_at FROM support_cases s
    JOIN users u ON u.id=s.user_id WHERE u.identity_subject=$1
    ORDER BY s.created_at DESC LIMIT 50`,[subject]);
  return {data:result.rows};
 }
 private async staff(identity:AuthenticatedIdentity){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic'||process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Support operations unavailable');
  requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'support:manage');
 }
 async queue(identity:AuthenticatedIdentity){
  await this.staff(identity);
  const r=await this.db.query(`SELECT c.id,c.category,c.status,c.preferred_contact,
    c.booking_id,c.created_at,w.id AS work_item_id
   FROM support_cases c LEFT JOIN support_work_items w ON w.case_id=c.id
   WHERE c.status<>'resolved' ORDER BY c.created_at ASC LIMIT 100`);
  return {data:r.rows};
 }
 async advance(identity:AuthenticatedIdentity,caseId:string,action:'assigned'|'resolved',reference:string){
  await this.staff(identity);
  if(!/^[A-Za-z0-9._:-]{10,128}$/.test(reference))
   throw new ConflictException('Reviewed evidence reference required');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const reviewer=(await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[identity.subject])).rows[0];
    if(!reviewer)throw new ForbiddenException('Reviewer account not provisioned');
    const state=(await c.query<{status:string}>(`SELECT status FROM support_cases
     WHERE id=$1 FOR UPDATE`,[caseId])).rows[0];
    if(!state)throw new NotFoundException('Support case not found');
    const allowed=(state.status==='open'&&action==='assigned')||
      (state.status==='assigned'&&action==='resolved');
    if(!allowed)throw new ConflictException('Invalid support case state transition');
    await c.query('UPDATE support_cases SET status=$2,updated_at=now() WHERE id=$1',[caseId,action]);
    await c.query(`UPDATE support_work_items SET status=$2 WHERE case_id=$1`,[caseId,action]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'support.case_' || $2,'support_case',$3,jsonb_build_object('evidenceReference',$4::text))`,
     [reviewer.id,action,caseId,reference]);
    await c.query('COMMIT');
    return {caseId,status:action};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }

}
