import {Injectable,OnModuleDestroy,ConflictException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase4SyntheticMode} from './phase4-mode';

type Payable={id:string;lab_id:string;amount_kobo:string;assigned_batch:string|null};
type Batch={id:string;lab_id:string;status:'pending'|'approved'|'rejected';
  requested_by:string;reviewed_by:string|null;review_note:string|null;total_kobo:string};

@Injectable()
export class Phase4LabSettlementsService implements OnModuleDestroy{
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db():Pool{
  if(!this.pool)throw new ServiceUnavailableException('Lab finance unavailable');
  return this.pool;
 }
 private async authorized(identity:AuthenticatedIdentity){
  requirePhase4SyntheticMode();requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'finance:manage');
 }
 private async actor(c:PoolClient,subject:string):Promise<string>{
  const q=await c.query<{id:string}>(`
    SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
    WHERE u.identity_subject=$1 AND st.active AND st.role='finance'
    FOR SHARE OF st`,[subject]);
  if(!q.rows[0])throw new ForbiddenException('Finance role required');
  return q.rows[0].id;
 }
 private async transact<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.db.connect();
  try{await c.query('BEGIN');
   try{const result=await work(c);await c.query('COMMIT');return result;}
   catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
 async payables(identity:AuthenticatedIdentity){
  await this.authorized(identity);
  const r=await this.db.query(`
    SELECT id,lab_id,result_id,amount_kobo,agreement_reference,assigned_batch,created_at
    FROM phase4_lab_payables ORDER BY created_at DESC,id DESC LIMIT 100`);
  return {data:r.rows};
 }
 async batches(identity:AuthenticatedIdentity){
  await this.authorized(identity);
  const r=await this.db.query(`
    SELECT id,lab_id,status,total_kobo,created_at,reviewed_at
    FROM phase4_lab_settlement_batches ORDER BY created_at DESC,id DESC LIMIT 100`);
  return {data:r.rows};
 }
 async addPayable(identity:AuthenticatedIdentity,input:{
  resultId:string;amountKobo:number;agreementReference:string
 }){
  await this.authorized(identity);
  return this.transact(async c=>{
   const actor=await this.actor(c,identity.subject);
   const source=await c.query<{lab_id:string}>(`
    SELECT i.lab_id FROM phase4_result_intakes i
    JOIN results r ON r.id=i.result_id
    JOIN orders o ON o.id=r.order_id AND o.lab_id=i.lab_id
    JOIN payments p ON p.order_id=o.id AND p.status='paid'
    WHERE i.result_id=$1 AND r.released_at IS NOT NULL
      AND r.released_by IS NOT NULL FOR SHARE OF r,i,p`,[input.resultId]);
   const labId=source.rows[0]?.lab_id;
   if(!labId)throw new ConflictException('Verified released result required');
   const existing=await c.query<{id:string;amount_kobo:string;agreement_reference:string}>(`
    SELECT id,amount_kobo,agreement_reference
    FROM phase4_lab_payables WHERE result_id=$1 FOR UPDATE`,[input.resultId]);
   if(existing.rows[0]){
    const row=existing.rows[0];
    if(BigInt(row.amount_kobo)!==BigInt(input.amountKobo)||
        row.agreement_reference!==input.agreementReference)
      throw new ConflictException('Lab payable details cannot be changed');
    return {data:{id:row.id,status:'recorded',replayed:true,payoutExecuted:false}};
   }
   const created=await c.query<{id:string}>(`
    INSERT INTO phase4_lab_payables(result_id,lab_id,amount_kobo,
      agreement_reference,entered_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [input.resultId,labId,input.amountKobo,input.agreementReference,actor]);
   const id=created.rows[0]!.id;
   await c.query(`
    INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
    VALUES($1,'phase4.lab_payable.recorded','lab_payable',$2)`,[actor,id]);
   return {data:{id,status:'recorded',replayed:false,payoutExecuted:false}};
  });
 }
 async propose(identity:AuthenticatedIdentity,input:{
  batchKey:string;labId:string;payableIds:string[]
 }){
  await this.authorized(identity);
  try{return await this.transact(async c=>{
   const actor=await this.actor(c,identity.subject);
   // Lock the laboratory first to serialize competing batch submissions.
   const lab=await c.query(`
     SELECT id FROM laboratories WHERE id=$1 AND active FOR UPDATE`,[input.labId]);
   if(lab.rowCount!==1)throw new ConflictException('Laboratory unavailable');
   const old=await c.query<Batch>(`
     SELECT * FROM phase4_lab_settlement_batches WHERE batch_key=$1`,[input.batchKey]);
   if(old.rows[0]){
     const batch=old.rows[0];
     const members=await c.query<{payable_id:string}>(`
       SELECT payable_id FROM phase4_lab_settlement_items WHERE batch_id=$1`,[batch.id]);
     if(batch.lab_id!==input.labId||members.rows.length!==input.payableIds.length||
       members.rows.some(row=>!input.payableIds.includes(row.payable_id))||
       batch.requested_by!==actor)
       throw new ConflictException('Settlement idempotency key reused');
     return {data:{id:batch.id,status:batch.status,replayed:true,payoutExecuted:false}};
   }
   const sorted=[...input.payableIds].sort();
   const rows=await c.query<Payable>(`
     SELECT id,lab_id,amount_kobo,assigned_batch FROM phase4_lab_payables
     WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[sorted]);
   if(rows.rows.length!==sorted.length||rows.rows.some(v=>
      v.lab_id!==input.labId||v.assigned_batch!==null))
     throw new ConflictException('Settlement contains unavailable or claimed payables');
   const total=rows.rows.reduce((sum,v)=>sum+BigInt(v.amount_kobo),0n);
   if(total<=0n)throw new ConflictException('Settlement amount invalid');
   const batch=await c.query<{id:string}>(`
     INSERT INTO phase4_lab_settlement_batches(batch_key,lab_id,requested_by,total_kobo)
     VALUES($1,$2,$3,$4) RETURNING id`,[input.batchKey,input.labId,actor,total.toString()]);
   const batchId=batch.rows[0]!.id;
   for(const row of rows.rows){
     await c.query(`
       INSERT INTO phase4_lab_settlement_items(batch_id,payable_id,amount_kobo)
       VALUES($1,$2,$3)`,[batchId,row.id,row.amount_kobo]);
   }
   await c.query(`
     UPDATE phase4_lab_payables SET assigned_batch=$1 WHERE id=ANY($2::uuid[])
       AND assigned_batch IS NULL`,[batchId,sorted]);
   await c.query(`
     INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'phase4.lab_settlement.proposed','lab_settlement',$2,$3::jsonb)`,
     [actor,batchId,JSON.stringify({payableCount:sorted.length})]);
   return {data:{id:batchId,status:'pending',totalKobo:total.toString(),
     replayed:false,payoutExecuted:false}};
  });}catch(error){
    if(error&&typeof error==='object'&&'code' in error&&
      (error as {code:unknown}).code==='23505')
      throw new ConflictException('Settlement already recorded');
    throw error;
  }
 }
 async review(identity:AuthenticatedIdentity,id:string,decision:'approve'|'reject',note:string){
  await this.authorized(identity);
  return this.transact(async c=>{
   const actor=await this.actor(c,identity.subject);
   if(decision==='approve'){
     // Approval never overrides laboratory deactivation. Acquire the lab
     // lock before the batch lock, matching settlement creation lock order.
     const current=await c.query<{lab_id:string}>(`
       SELECT lab_id FROM phase4_lab_settlement_batches WHERE id=$1`,[id]);
     if(!current.rows[0])throw new ForbiddenException('Settlement unavailable');
     const live=await c.query(`
       SELECT id FROM laboratories WHERE id=$1 AND active FOR SHARE`,
       [current.rows[0].lab_id]);
     if(live.rowCount!==1)throw new ConflictException('Laboratory is no longer active');
   }
   const batch=await c.query<Batch>(`
     SELECT * FROM phase4_lab_settlement_batches WHERE id=$1 FOR UPDATE`,[id]);
   const value=batch.rows[0];
   if(!value)throw new ForbiddenException('Settlement unavailable');
   if(value.requested_by===actor)throw new ForbiddenException('Independent settlement reviewer required');
   if(decision==='approve'&&value.status==='pending'){
     const sources=await c.query<{payment_status:string;released:boolean}>(`
       SELECT p.status AS payment_status,
         (r.released_at IS NOT NULL AND r.released_by IS NOT NULL) AS released
       FROM phase4_lab_settlement_items it
       JOIN phase4_lab_payables payable ON payable.id=it.payable_id
       JOIN results r ON r.id=payable.result_id
       JOIN payments p ON p.order_id=r.order_id
       WHERE it.batch_id=$1
       FOR SHARE OF p,r,payable`,[id]);
     if(sources.rows.length===0||sources.rows.some(row=>
       row.payment_status!=='paid'||!row.released))
       throw new ConflictException('Settlement sources no longer payable');
   }
   const status=decision==='approve'?'approved':'rejected';
   if(value.status!=='pending'){
     if(value.status!==status||value.reviewed_by!==actor||value.review_note!==note)
       throw new ConflictException('Settlement decision already finalized');
     return {data:{id,status,replayed:true,payoutExecuted:false}};
   }
   await c.query(`
     UPDATE phase4_lab_settlement_batches
     SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4
     WHERE id=$1 AND status='pending'`,[id,status,actor,note]);
   if(status==='rejected'){
     await c.query(`
       UPDATE phase4_lab_payables SET assigned_batch=NULL
       WHERE assigned_batch=$1`,[id]);
   }
   await c.query(`
     INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,$2,'lab_settlement',$3,$4::jsonb)`,
     [actor,'phase4.lab_settlement.'+status,id,JSON.stringify({payoutExecuted:false})]);
   return {data:{id,status,replayed:false,payoutExecuted:false}};
  });
 }
}
