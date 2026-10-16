import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AccessService } from './access.service';
import { type AuthenticatedIdentity,requireStaffMfa } from './identity';

const uuid=z.string().uuid();
export const guestStartInput=z.object({
 email:z.string().trim().toLowerCase().email().max(320),quoteId:uuid
}).strict();
export const guestVerifyInput=z.object({
 requestId:uuid,code:z.string().regex(/^[0-9]{8}$/)
}).strict();
const evidence=z.string().regex(/^[A-Za-z0-9._:-]{10,128}$/);
function enabled(){
 if(process.env.NODE_ENV==='production' ||
    process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' ||
    process.env.FISHER_PHASE2_EMAIL_MODE!=='staging')
  throw new ServiceUnavailableException('Guest-assisted intake disabled');
 const key=process.env.RESEND_API_KEY,from=process.env.FISHER_STAGING_EMAIL_FROM;
 const pepper=process.env.FISHER_GUEST_CODE_PEPPER;
 const allow=(process.env.FISHER_STAGING_EMAIL_ALLOWLIST??'').split(',')
  .map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!key||!from||!pepper||!/^[A-Za-z0-9_-]{43}$/.test(pepper)||
  !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(from)||!allow.length)
  throw new ServiceUnavailableException('Synthetic guest email integration unavailable');
 return {key,from,pepper,allow};
}
function digest(value:string,pepper:string){
 return createHmac('sha256',Buffer.from(pepper,'base64url')).update(value).digest('hex');
}
@Injectable()
export class GuestBookingService implements OnModuleDestroy {
 private readonly db?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.db=new Pool({connectionString:process.env.DATABASE_URL,max:5});
 }
 async onModuleDestroy(){await this.db?.end();}
 private database(){if(!this.db)throw new ServiceUnavailableException('Guest requests unavailable');return this.db;}
 async start(body:unknown){
  const cfg=enabled();
  const parsed=guestStartInput.safeParse(body);
  if(!parsed.success)throw new BadRequestException('Invalid guest request');
  const {email,quoteId}=parsed.data;
  if(!cfg.allow.includes(email))throw new ServiceUnavailableException('Guest-assisted sandbox inbox not enabled');
  const pool=this.database(),c=await pool.connect();
  const code=String(randomInt(0,100000000)).padStart(8,'0');
  let id='';
  try{
   await c.query('BEGIN');
   try{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[email]);
    const rate=await c.query<{total:number}>(`SELECT count(*)::integer AS total
      FROM guest_booking_requests WHERE email=$1 AND created_at>clock_timestamp()-interval '1 hour'`,[email]);
    if((rate.rows[0]?.total??0)>=3)throw new ConflictException('Contact verification rate limit reached');
    const quote=await c.query(`SELECT 1 FROM booking_quotes WHERE id=$1 AND expires_at>clock_timestamp()`,[quoteId]);
    if(!quote.rows.length)throw new ConflictException('Quotation expired');
    const row=await c.query<{id:string}>(`INSERT INTO guest_booking_requests(
      email,quote_id,code_hash,expires_at)
      VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes') RETURNING id`,
      [email,quoteId,digest(code,cfg.pepper)]);
    id=row.rows[0]!.id;
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
  let accepted=false;
  try{
   const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',
     'Idempotency-Key':'fisher-guest-'+id},
    body:JSON.stringify({from:cfg.from,to:[email],subject:'Fisher Healthcare guest request verification',
     text:'Your synthetic Fisher Healthcare guest request verification code is '+code+
      '. This code expires in 10 minutes. Do not share this code. No appointment is reserved.'}),
    signal:AbortSignal.timeout(10000)
   });
   const data:unknown=response.ok?await response.json():null;
   accepted=Boolean(data&&typeof data==='object'&&'id' in data&&typeof data.id==='string');
  }catch{/* Unknown send outcome; do not leak verification codes in errors or logs. */}
  if(!accepted)throw new ServiceUnavailableException('Guest email request not acknowledged by provider');
  return {requestId:id,expiresInSeconds:600,status:'email_verification_required'};
 }
 async verify(body:unknown){
  const cfg=enabled();
  const parsed=guestVerifyInput.safeParse(body);
  if(!parsed.success)throw new BadRequestException('Invalid verification payload');
  const {requestId,code}=parsed.data;
  const pool=this.database(),c=await pool.connect();
  let committed=false;
  try{
   await c.query('BEGIN');
   try{
    const row=(await c.query<{email:string;code_hash:string;attempts:number;verified_at:Date|null;expires_at:Date}>(
     'SELECT email,code_hash,attempts,verified_at,expires_at FROM guest_booking_requests WHERE id=$1 FOR UPDATE',
     [requestId])).rows[0];
    if(!row)throw new UnauthorizedException('Invalid or expired verification');
    if(!cfg.allow.includes(row.email))throw new UnauthorizedException('Unapproved synthetic recipient');
    if(row.verified_at){await c.query('COMMIT');committed=true;return {requestId,status:'pending_review'};}
    if(row.attempts>=5||row.expires_at<=new Date())throw new UnauthorizedException('Invalid or expired verification');
    const matches=timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(digest(code,cfg.pepper),'hex'));
    if(!matches){
     await c.query('UPDATE guest_booking_requests SET attempts=attempts+1 WHERE id=$1',[requestId]);
     await c.query('COMMIT');committed=true;
     throw new UnauthorizedException('Invalid or expired verification');
    }
    await c.query(`UPDATE guest_booking_requests SET verified_at=clock_timestamp(),
       status='pending_review',updated_at=clock_timestamp() WHERE id=$1`,[requestId]);
    await c.query('INSERT INTO outbox(event_type,payload) VALUES($1,$2::jsonb)',
     ['guest.booking_verified',JSON.stringify({requestId})]);
    await c.query('COMMIT');committed=true;
    return {requestId,status:'pending_review'};
   }catch(e){
    if(!committed)await c.query('ROLLBACK');
    throw e;
   }
  }finally{c.release();}
 }
 async pending(identity:AuthenticatedIdentity){
  enabled();requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'orders:manage');
  const r=await this.database().query(`SELECT g.id,g.email,g.quote_id,g.status,g.verified_at
   FROM guest_booking_requests g WHERE g.verified_at IS NOT NULL AND
    g.status IN ('pending_review','in_review') ORDER BY g.created_at DESC LIMIT 50`);
  return {data:r.rows};
 }
 async assign(identity:AuthenticatedIdentity,id:string,reference:string){
  enabled();requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'orders:manage');
  if(!evidence.safeParse(reference).success)throw new BadRequestException('Evidence reference required');
  const c=await this.database().connect();
  try{
   await c.query('BEGIN');
   try{
    const reviewer=(await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[identity.subject])).rows[0];
    if(!reviewer)throw new UnauthorizedException('Staff identity unavailable');
    const row=await c.query(`UPDATE guest_booking_requests SET status='in_review',updated_at=now()
      WHERE id=$1 AND verified_at IS NOT NULL AND status='pending_review' RETURNING id`,[id]);
    if(row.rowCount!==1)throw new ConflictException('Guest request not eligible for assignment');
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
      VALUES($1,'guest.assisted_review_started','guest_booking',$2,
       jsonb_build_object('evidenceReference',$3))`,[reviewer.id,id,reference]);
    await c.query('COMMIT');
    return {requestId:id,status:'in_review'};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
