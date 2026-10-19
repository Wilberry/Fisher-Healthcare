import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { AccessService } from './access.service';
import { type AuthenticatedIdentity,requireStaffMfa } from './identity';
@Injectable()
export class PaymentReviewService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Payment review unavailable');return this.pool;}
 private async authorized(identity:AuthenticatedIdentity){
  if(process.env.FISHER_PHASE2_PAYMENT_MODE!=='staging'||process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Payment review not available');
  requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'finance:manage');
 }
 async queue(identity:AuthenticatedIdentity){
  await this.authorized(identity);
  const r=await this.db.query(`SELECT a.id,a.order_id,a.payment_id,a.reason,a.created_at,
    o.status AS booking_status,p.status AS payment_status
   FROM payment_review_alerts a JOIN orders o ON o.id=a.order_id
    JOIN payments p ON p.id=a.payment_id
   WHERE a.resolved_at IS NULL ORDER BY a.created_at LIMIT 100`);
  return {data:r.rows};
 }
 async acknowledge(identity:AuthenticatedIdentity,id:string,reference:string){
  await this.authorized(identity);
  if(!/^[A-Za-z0-9._:-]{10,128}$/.test(reference))
   throw new ConflictException('Reviewed evidence reference required');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const actor=(await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[identity.subject])).rows[0];
    if(!actor)throw new ForbiddenException('Account not provisioned');
    const r=await c.query(`UPDATE payment_review_alerts SET resolved_at=now()
      WHERE id=$1 AND resolved_at IS NULL RETURNING id`,[id]);
    if(!r.rows[0])throw new NotFoundException('Open payment exception not found');
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'payment.exception_acknowledged','payment_review_alert',$2,
       jsonb_build_object('evidenceReference',$3,'refundExecuted',false))`,
     [actor.id,id,reference]);
    await c.query('COMMIT');
    return {alertId:id,status:'acknowledged',refundExecuted:false};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
