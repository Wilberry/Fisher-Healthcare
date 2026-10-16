import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { BookingService } from './booking.service';

const VERIFY_BASE='https://api.paystack.co/transaction/verify/';
const INIT_URL='https://api.paystack.co/transaction/initialize';
type Verified={reference:string;amount:number;currency:string;status:string;paid_at:string|null};

export function validPaystackSignature(raw:Buffer, signature:string|undefined, secret:string):boolean {
 if(!signature || !/^[a-f0-9]{128}$/i.test(signature))return false;
 const digest=createHmac('sha512',secret).update(raw).digest();
 const supplied=Buffer.from(signature,'hex');
 return supplied.length===digest.length && timingSafeEqual(supplied,digest);
}
export function verifiedPaymentMatches(v:Verified,reference:string,amount:number){
 return v.reference===reference && v.status==='success' && v.currency==='NGN'
   && v.amount===amount && Number.isSafeInteger(v.amount) && Boolean(v.paid_at);
}

@Injectable()
export class PaymentService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(private readonly bookings:BookingService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Payments unavailable');return this.pool;}
 private stagingKey(){
  const secret=process.env.PAYSTACK_SECRET_KEY;
  // Production charging requires a separate reviewed deployment and pilot approval.
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.FISHER_PHASE2_PAYMENT_MODE!=='staging' || process.env.NODE_ENV==='production'
    || !secret?.startsWith('sk_test_'))throw new ServiceUnavailableException('Checkout not activated');
  return secret;
 }
 private async requestProvider(url:string,opts:RequestInit){
  let response:Response;
  try{response=await fetch(url,{...opts,signal:AbortSignal.timeout(10000)});}
  catch{throw new ServiceUnavailableException('Payment provider unavailable');}
  if(!response.ok)throw new ServiceUnavailableException('Payment provider rejected request');
  try{return await response.json() as unknown;}
  catch{throw new ServiceUnavailableException('Payment provider response invalid');}
 }
 async checkout(subject:string,bookingId:string){
  const key=this.stagingKey();
  const eligible=await this.bookings.checkoutOrder(subject,bookingId);
  if(!eligible.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(eligible.email))
   throw new ConflictException('Verified contact email required');
  const c=await this.db.connect();
  let ref='';
  let paymentId='';
  try{
   await c.query('BEGIN');
   const o=await c.query<{status:string;payment_expires_at:Date;total_kobo:number}>(
    'SELECT status,payment_expires_at,total_kobo FROM orders WHERE id=$1 FOR UPDATE',[bookingId]);
   if(!o.rows[0] || o.rows[0].status!=='awaiting_payment' || o.rows[0].payment_expires_at<=new Date())
    throw new ConflictException('Booking no longer payable');
   if(o.rows[0].total_kobo!==eligible.total_kobo)throw new ConflictException('Booking value changed');
   const existing=await c.query<{id:string;provider_reference:string;status:string}>(
    'SELECT id,provider_reference,status FROM payments WHERE order_id=$1',[bookingId]);
   if(existing.rows[0]){
    if(existing.rows[0].status==='paid')throw new ConflictException('Booking already paid');
    // Never initiate a second provider session implicitly for the same order.
    throw new ConflictException('Checkout already initiated; contact support if interrupted');
   }
   paymentId=randomUUID();ref='fisher-staging-'+randomUUID();
   await c.query(`INSERT INTO payments(id,order_id,provider_reference,amount_kobo,status)
    VALUES($1,$2,$3,$4,'initiating')`,[paymentId,bookingId,ref,eligible.total_kobo]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  const provider=await this.requestProvider(INIT_URL,{
   method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({email:eligible.email,amount:eligible.total_kobo,currency:'NGN',reference:ref})
  });
  if(typeof provider!=='object' || provider===null ||
   !('data' in provider) || typeof provider.data!=='object' || provider.data===null ||
   !('authorization_url' in provider.data) || typeof provider.data.authorization_url!=='string')
   throw new ServiceUnavailableException('Invalid checkout response');
  if(!('status' in provider) || provider.status!==true ||
   !('reference' in provider.data) || provider.data.reference!==ref)
   throw new ServiceUnavailableException('Checkout reference not acknowledged');
  const checkoutUrl=provider.data.authorization_url;
  let u:URL;
  try{u=new URL(checkoutUrl);}catch{throw new ServiceUnavailableException('Invalid checkout URL');}
  if(u.protocol!=='https:' || u.hostname!=='checkout.paystack.com')
   throw new ServiceUnavailableException('Untrusted checkout URL');
  await this.db.query("UPDATE payments SET status='pending',updated_at=now() WHERE id=$1 AND status='initiating'",[paymentId]);
  return {paymentId,bookingId,authorizationUrl:checkoutUrl};
 }
 private async verifyWithProvider(reference:string,key:string):Promise<Verified>{
  if(!/^[A-Za-z0-9._-]{1,200}$/.test(reference))throw new BadRequestException('Invalid reference');
  const body=await this.requestProvider(VERIFY_BASE+encodeURIComponent(reference),{
   method:'GET',headers:{Authorization:'Bearer '+key}
  });
  if(typeof body!=='object' || body===null || !('data' in body) ||
   typeof body.data!=='object' || body.data===null)
   throw new ServiceUnavailableException('Invalid verification response');
  const d=body.data as Record<string,unknown>;
  if(typeof d.reference!=='string' || typeof d.amount!=='number' || typeof d.currency!=='string' ||
    typeof d.status!=='string' || (d.paid_at!==null && typeof d.paid_at!=='string'))
   throw new ServiceUnavailableException('Incomplete verification evidence');
  return {reference:d.reference,amount:d.amount,currency:d.currency,status:d.status,paid_at:d.paid_at as string|null};
 }
 async webhook(raw:Buffer|undefined,signature:string|undefined){
  const key=this.stagingKey();
  if(!raw || raw.length>65536 || !validPaystackSignature(raw,signature,key))
   throw new UnauthorizedException('Invalid provider signature');
  let body:unknown;
  try{body=JSON.parse(raw.toString('utf8')) as unknown;}
  catch{throw new BadRequestException('Invalid webhook JSON');}
  if(typeof body!=='object'||body===null|| !('event' in body) ||
   !('data' in body)||typeof body.data!=='object'||body.data===null)
   throw new BadRequestException('Invalid webhook shape');
  if(body.event!=='charge.success')return {received:true};
  const d=body.data as Record<string,unknown>;
  if(typeof d.reference!=='string')throw new BadRequestException('Missing payment reference');
  const reference=d.reference;
  const verified=await this.verifyWithProvider(reference,key);
  if(verified.status!=='success')throw new ConflictException('Payment not settled');
  const hash=createHash('sha256').update(raw).digest('hex');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   // Resolve immutable order/slot identity before acquiring locks; lock slot, then order, then payment.
   const identified=await c.query<{id:string;order_id:string;amount_kobo:number}>(
    'SELECT id,order_id,amount_kobo FROM payments WHERE provider_reference=$1',[reference]);
   if(!identified.rows[0])throw new ConflictException('Unknown payment reference');
   const p=identified.rows[0];
   // Capacity reconciliation and payment confirmation must serialize with new holds.
   const link=await c.query<{slot_id:string|null}>('SELECT slot_id FROM orders WHERE id=$1',[p.order_id]);
   if(!link.rows[0]?.slot_id)throw new ConflictException('Booking has no collection slot');
   await c.query('SELECT id FROM collection_slots WHERE id=$1 FOR UPDATE',[link.rows[0].slot_id]);
   const order=await c.query<{status:string;payment_expires_at:Date;total_kobo:number}>(
    'SELECT status,payment_expires_at,total_kobo FROM orders WHERE id=$1 FOR UPDATE',[p.order_id]);
   const locked=await c.query<{status:string}>(
    'SELECT status FROM payments WHERE id=$1 FOR UPDATE',[p.id]);
   if(!order.rows[0] || !locked.rows[0])throw new ConflictException('Payment state missing');
   if(!verifiedPaymentMatches(verified,reference,p.amount_kobo) ||
    order.rows[0].total_kobo!==p.amount_kobo)throw new ConflictException('Verified amount mismatch');
   if(locked.rows[0].status==='paid'){await c.query('COMMIT');return {received:true};}
   await c.query('INSERT INTO payment_webhook_events(event_hash,provider_reference) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [hash,reference]);
   await c.query("UPDATE payments SET status='paid',updated_at=now() WHERE id=$1",[p.id]);
   const confirmed=await c.query(
    "UPDATE orders SET status='confirmed',updated_at=now() WHERE id=$1 AND status='awaiting_payment' AND payment_expires_at>clock_timestamp() RETURNING id",
    [p.order_id]);
   const confirm=confirmed.rowCount===1;
   if(!confirm && order.rows[0].status!=='confirmed')
    await c.query("UPDATE orders SET status='exception',updated_at=now() WHERE id=$1",[p.order_id]);
   // Equal and opposite, append-only accounting entries. Later reconciliation handles provider fees.
   await c.query(`INSERT INTO ledger_entries(transaction_id,account,amount_kobo)
    VALUES($1,'payment_clearing',$2),($1,'customer_receivable',$3)`,[p.id,p.amount_kobo,-p.amount_kobo]);
   await c.query('INSERT INTO outbox(event_type,payload) VALUES($1,$2::jsonb)',
    [confirm?'booking.confirmed':'payment.manual_review',JSON.stringify({orderId:p.order_id,paymentId:p.id})]);
   await c.query('COMMIT');
   return {received:true};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
