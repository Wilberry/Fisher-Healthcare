import {Injectable,OnModuleDestroy,ConflictException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase4SyntheticMode} from './phase4-mode';
import type {RefundRequest} from './refund-policy';

type RefundRow={
  id:string;request_key:string;payment_id:string;amount_kobo:number;
  reason_code:string;status:'pending'|'approved'|'rejected';requested_by:string;
  reviewed_by:string|null;review_note:string|null
};
@Injectable()
export class Phase4RefundService implements OnModuleDestroy{
  private readonly pool?:Pool;
  constructor(private readonly access:AccessService){
    if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
  }
  async onModuleDestroy(){await this.pool?.end();}
  private get db():Pool{
    if(!this.pool)throw new ServiceUnavailableException('Refund service unavailable');
    return this.pool;
  }
  private async actor(c:PoolClient,subject:string):Promise<string>{
    const r=await c.query<{id:string}>(`
      SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
      WHERE u.identity_subject=$1 AND st.active AND st.role='finance'
      FOR SHARE OF st`,[subject]);
    if(!r.rows[0])throw new ForbiddenException('Finance approval role required');
    return r.rows[0].id;
  }
  private async authorized(identity:AuthenticatedIdentity,action:'finance:read'|'finance:manage'){
    requirePhase4SyntheticMode();requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,action);
  }
  async list(identity:AuthenticatedIdentity){
    await this.authorized(identity,'finance:read');
    const r=await this.db.query(`
      SELECT id,payment_id,amount_kobo,reason_code,status,created_at,reviewed_at
      FROM phase4_refund_requests ORDER BY created_at DESC,id DESC LIMIT 100`);
    return {data:r.rows};
  }
  async request(identity:AuthenticatedIdentity,input:RefundRequest){
    await this.authorized(identity,'finance:manage');
    const c=await this.db.connect();
    try{
      await c.query('BEGIN');
      try{
        const actor=await this.actor(c,identity.subject);
        // Shared lock ordering: payment first, then refund rows.
        const payment=await c.query<{amount_kobo:number;status:string}>(`
          SELECT amount_kobo,status FROM payments WHERE id=$1 FOR UPDATE`,[input.paymentId]);
        const previous=await c.query<RefundRow>(`
          SELECT * FROM phase4_refund_requests WHERE request_key=$1`,[input.requestKey]);
        if(previous.rows[0]){
          const existing=previous.rows[0];
          if(existing.payment_id!==input.paymentId||existing.amount_kobo!==input.amountKobo||
             existing.reason_code!==input.reasonCode||existing.requested_by!==actor)
            throw new ConflictException('Refund idempotency key reused');
          await c.query('COMMIT');
          return {data:{id:existing.id,status:existing.status,replayed:true,providerRefundExecuted:false}};
        }
        if(payment.rows[0]?.status!=='paid')
          throw new ConflictException('Only verified paid payments can be reviewed for refund');
        const prior=await c.query<{reserved:string}>(`
          SELECT COALESCE(SUM(amount_kobo),0)::text AS reserved
          FROM phase4_refund_requests
          WHERE payment_id=$1 AND status IN ('pending','approved')`,[input.paymentId]);
        if(BigInt(prior.rows[0]!.reserved)+BigInt(input.amountKobo)>
          BigInt(payment.rows[0].amount_kobo))
          throw new ConflictException('Refund exceeds payment available for review');
        const inserted=await c.query<{id:string}>(`
          INSERT INTO phase4_refund_requests(request_key,payment_id,amount_kobo,
            reason_code,requested_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [input.requestKey,input.paymentId,input.amountKobo,input.reasonCode,actor]);
        const id=inserted.rows[0]!.id;
        await c.query(`
          INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
          VALUES($1,'phase4.refund.requested','refund_request',$2)`,[actor,id]);
        await c.query('COMMIT');
        return {data:{id,status:'pending',replayed:false,providerRefundExecuted:false}};
      }catch(e){await c.query('ROLLBACK');throw e;}
    }finally{c.release();}
  }
  async review(identity:AuthenticatedIdentity,id:string,
    decision:'approve'|'reject',note:string){
    await this.authorized(identity,'finance:manage');
    const c=await this.db.connect();
    try{
      await c.query('BEGIN');
      try{
        const actor=await this.actor(c,identity.subject);
        const reference=await c.query<{payment_id:string}>(`
          SELECT payment_id FROM phase4_refund_requests WHERE id=$1`,[id]);
        if(!reference.rows[0])throw new ForbiddenException('Refund request unavailable');
        const payment=await c.query<{status:string;amount_kobo:number}>(`
          SELECT status,amount_kobo FROM payments WHERE id=$1 FOR UPDATE`,
          [reference.rows[0].payment_id]);
        const result=await c.query<RefundRow>(`
          SELECT * FROM phase4_refund_requests WHERE id=$1 FOR UPDATE`,[id]);
        const refund=result.rows[0];
        if(!refund)throw new ForbiddenException('Refund request unavailable');
        if(refund.requested_by===actor)
          throw new ForbiddenException('Independent finance reviewer required');
        const target=decision==='approve'?'approved':'rejected';
        if(refund.status!== 'pending'){
          if(refund.status!==target||refund.reviewed_by!==actor||refund.review_note!==note)
            throw new ConflictException('Refund decision already finalized');
          await c.query('COMMIT');
          return {data:{id,status:target,replayed:true,providerRefundExecuted:false}};
        }
        // A request accepted while the payment was paid is not a standing
        // authorization to refund after an independent reversal or status change.
        if(decision==='approve'&&payment.rows[0]?.status!=='paid')
          throw new ConflictException('Payment no longer eligible for refund approval');
        if(decision==='approve'&&BigInt(refund.amount_kobo)>BigInt(payment.rows[0]!.amount_kobo))
          throw new ConflictException('Approved refund exceeds current payment amount');

        await c.query(`
          UPDATE phase4_refund_requests
          SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4
          WHERE id=$1 AND status='pending'`,[id,target,actor,note]);
        await c.query(`
          INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
          VALUES($1,$2,'refund_request',$3,$4::jsonb)`,
          [actor,'phase4.refund.'+target,id,JSON.stringify({providerRefundExecuted:false})]);
        await c.query('COMMIT');
        return {data:{id,status:target,replayed:false,providerRefundExecuted:false}};
      }catch(e){await c.query('ROLLBACK');throw e;}
    }finally{c.release();}
  }
}
