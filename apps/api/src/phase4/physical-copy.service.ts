import {ConflictException,ForbiddenException,Injectable,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase4SyntheticMode} from './phase4-mode';

type CopyRequest={id:string;result_id:string;patient_id:string;address_id:string;
  requested_by:string;status:string;quote_kobo:number|null};
type NewCopy={resultId:string;addressId:string;requestKey:string};
@Injectable()
export class Phase4PhysicalCopyService implements OnModuleDestroy{
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
   if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db():Pool{
   if(!this.pool)throw new ServiceUnavailableException('Physical-copy service unavailable');
   return this.pool;
 }
 private async tx<T>(run:(c:PoolClient)=>Promise<T>):Promise<T>{
   const c=await this.db.connect();
   try{
     await c.query('BEGIN');
     try{const value=await run(c);await c.query('COMMIT');return value;}
     catch(error){await c.query('ROLLBACK');throw error;}
   }finally{c.release();}
 }
 private async requester(c:PoolClient,subject:string,patientId:string):Promise<string>{
   const q=await c.query<{id:string}>(`
     SELECT u.id FROM users u
     JOIN patient_relationships rel ON rel.user_id=u.id
     WHERE u.identity_subject=$1 AND rel.patient_id=$2
       AND rel.relationship='self' AND rel.can_book AND rel.can_view_results
       AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
     FOR SHARE OF rel`,[subject,patientId]);
   if(!q.rows[0])throw new ForbiddenException('Physical-copy authority denied');
   return q.rows[0].id;
 }
 async patientRequests(identity:AuthenticatedIdentity,patientId:string){
   requirePhase4SyntheticMode();
   return this.tx(async c=>{
     const userId=await this.requester(c,identity.subject,patientId);
     const res=await c.query(`
       SELECT id,result_id,status,quote_kobo,created_at,quoted_at
       FROM phase4_physical_copy_requests
       WHERE requested_by=$1 AND patient_id=$2
       ORDER BY created_at DESC,id DESC LIMIT 50`,[userId,patientId]);
     return {data:res.rows,paymentCollectionEnabled:false,deliveryEnabled:false};
   });
 }
 async request(identity:AuthenticatedIdentity,patientId:string,input:NewCopy){
   requirePhase4SyntheticMode();
   try{return await this.tx(async c=>{
     const actor=await this.requester(c,identity.subject,patientId);
     const eligible=await c.query(`
       SELECT res.id FROM results res
       JOIN phase4_result_release_events released ON released.result_id=res.id
       JOIN patient_addresses addr ON addr.id=$3 AND addr.patient_id=res.patient_id
         AND addr.owner_user_id=$4 AND addr.verified_at IS NOT NULL AND addr.revoked_at IS NULL
       JOIN service_zones zone ON zone.id=addr.zone_id AND zone.active
       WHERE res.id=$1 AND res.patient_id=$2 AND res.released_at IS NOT NULL
         AND res.released_by IS NOT NULL
       FOR SHARE OF res,addr,zone`,
       [input.resultId,patientId,input.addressId,actor]);
     if(eligible.rowCount!==1)
       throw new ForbiddenException('Released result and verified address required');
     const previous=await c.query<CopyRequest>(`
       SELECT id,result_id,patient_id,address_id,requested_by,status
       FROM phase4_physical_copy_requests WHERE request_key=$1
       FOR SHARE`,[input.requestKey]);
     if(previous.rows[0]){
       const old=previous.rows[0];
       if(old.result_id!==input.resultId||old.patient_id!==patientId||
         old.address_id!==input.addressId||old.requested_by!==actor)
         throw new ConflictException('Physical-copy request key reused');
       return {data:{id:old.id,status:old.status,replayed:true,
         paymentCollectionEnabled:false,deliveryEnabled:false}};
     }
     const created=await c.query<{id:string}>(`
       INSERT INTO phase4_physical_copy_requests
         (request_key,result_id,patient_id,address_id,requested_by)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
       [input.requestKey,input.resultId,patientId,input.addressId,actor]);
     const id=created.rows[0]!.id;
     await c.query(`
       INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
       VALUES($1,'phase4.physical_copy.requested','physical_copy',$2)`,[actor,id]);
     return {data:{id,status:'requested',replayed:false,
       paymentCollectionEnabled:false,deliveryEnabled:false}};
   });}catch(error){
     if(error&&typeof error==='object'&&'code' in error&&
       (error as {code:unknown}).code==='23505')
       throw new ConflictException('Physical-copy request already exists');
     throw error;
   }
 }
 async cancel(identity:AuthenticatedIdentity,patientId:string,id:string){
   requirePhase4SyntheticMode();
   return this.tx(async c=>{
     const actor=await this.requester(c,identity.subject,patientId);
     const row=await c.query<CopyRequest>(`
       SELECT * FROM phase4_physical_copy_requests
       WHERE id=$1 AND patient_id=$2 AND requested_by=$3 FOR UPDATE`,
       [id,patientId,actor]);
     const request=row.rows[0];
     if(!request)throw new ForbiddenException('Request unavailable');
     if(request.status==='cancelled')return {data:{id,status:'cancelled',replayed:true}};
     if(request.status!=='requested')
       throw new ConflictException('Quoted request requires support to resolve');
     await c.query(`UPDATE phase4_physical_copy_requests
       SET status='cancelled' WHERE id=$1 AND status='requested'`,[id]);
     await c.query(`
       INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
       VALUES($1,'phase4.physical_copy.cancelled','physical_copy',$2)`,[actor,id]);
     return {data:{id,status:'cancelled',replayed:false}};
   });
 }
 private async finance(identity:AuthenticatedIdentity,capability:'finance:read'|'finance:manage'){
   requirePhase4SyntheticMode();
   requireStaffMfa(identity);
   await this.access.requireStaffCapability(identity.subject,capability);
 }
 async queue(identity:AuthenticatedIdentity){
   await this.finance(identity,'finance:read');
   const rows=await this.db.query(`
     SELECT id,status,quote_kobo,created_at,quoted_at
     FROM phase4_physical_copy_requests
     ORDER BY created_at DESC,id DESC LIMIT 100`);
   return {data:rows.rows};
 }
 async quote(identity:AuthenticatedIdentity,id:string,amountKobo:number){
   await this.finance(identity,'finance:manage');
   return this.tx(async c=>{
     const staff=await c.query<{id:string}>(`
       SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
       WHERE u.identity_subject=$1 AND st.active AND st.role='finance'
       FOR SHARE OF st`,[identity.subject]);
     const actor=staff.rows[0]?.id;
     if(!actor)throw new ForbiddenException('Finance reviewer required');
     const row=await c.query<CopyRequest>(`
       SELECT * FROM phase4_physical_copy_requests WHERE id=$1
       FOR UPDATE`,[id]);
     const request=row.rows[0];
     if(!request)throw new ForbiddenException('Request unavailable');
     if(request.requested_by===actor)
       throw new ForbiddenException('Independent quote required');
     if(request.status==='quoted'){
       if(request.quote_kobo!==amountKobo)
         throw new ConflictException('Physical-copy quote cannot be rewritten');
       return {data:{id,status:'quoted',replayed:true,
         paymentCollectionEnabled:false,deliveryEnabled:false}};
     }
     if(request.status!=='requested')
       throw new ConflictException('Request no longer available for quote');
     const eligible=await c.query(`
       SELECT 1 FROM phase4_physical_copy_requests item
       JOIN results res ON res.id=item.result_id
       JOIN phase4_result_release_events released ON released.result_id=res.id
       JOIN patient_relationships rel ON rel.patient_id=item.patient_id
         AND rel.user_id=item.requested_by
         AND rel.relationship='self' AND rel.can_view_results AND rel.can_book
         AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
       JOIN patient_addresses addr ON addr.id=item.address_id
         AND addr.patient_id=item.patient_id
         AND addr.owner_user_id=item.requested_by
         AND addr.verified_at IS NOT NULL AND addr.revoked_at IS NULL
       JOIN service_zones zone ON zone.id=addr.zone_id AND zone.active
       WHERE item.id=$1 AND res.released_at IS NOT NULL AND res.released_by IS NOT NULL
       FOR SHARE OF res,rel,addr,zone`,[id]);
     if(eligible.rowCount!==1)
       throw new ConflictException('Patient, released result or delivery address no longer valid');
     await c.query(`UPDATE phase4_physical_copy_requests
       SET status='quoted',quote_kobo=$2,quoted_by=$3,quoted_at=now()
       WHERE id=$1 AND status='requested'`,[id,amountKobo,actor]);
     await c.query(`
       INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
       VALUES($1,'phase4.physical_copy.quoted','physical_copy',$2)`,[actor,id]);
     return {data:{id,status:'quoted',replayed:false,
       paymentCollectionEnabled:false,deliveryEnabled:false}};
   });
 }
}
