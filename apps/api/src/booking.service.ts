import { Injectable, OnModuleDestroy, BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { quoteTotals, type BookingQuoteInput, type QuoteItem } from '@fisher/contracts';

type Slot={id:string;zone_id:string;lab_id:string;tier:'regular'|'premium';capacity:number;cutoff_at:Date;starts_at:Date;ends_at:Date};
type Quote={id:string;zone_id:string;slot_id:string;lab_id:string;tier:'regular'|'premium';items:QuoteItem[];total_kobo:number;expires_at:Date};
type Draft={id:string;quote_id:string;patient_id:string;user_id:string;status:string;order_id:string|null};

@Injectable()
export class BookingService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:8});}
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Data service unavailable');return this.pool;}
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.db.connect();
  try {await c.query('BEGIN');try{const result=await fn(c);await c.query('COMMIT');return result;}
    catch(e){await c.query('ROLLBACK');throw e;}}
  finally{c.release();}
 }
 private async actor(c:PoolClient,subject:string):Promise<string>{
  const r=await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[subject]);
  if(!r.rows[0])throw new ForbiddenException('Account not provisioned');return r.rows[0].id;
 }
 private async authorize(c:PoolClient,userId:string,patientId:string){
  const r=await c.query(`SELECT 1 FROM patient_relationships
   WHERE user_id=$1 AND patient_id=$2 AND can_book AND verified_at IS NOT NULL AND revoked_at IS NULL
   FOR SHARE`,[userId,patientId]);
  if(!r.rows.length)throw new ForbiddenException('Patient booking authority denied');
 }
 private async slot(c:PoolClient,id:string):Promise<Slot>{
  const r=await c.query<Slot>(`SELECT s.id,s.zone_id,s.lab_id,s.tier,s.capacity,s.cutoff_at,s.starts_at,s.ends_at
   FROM collection_slots s JOIN service_zones z ON z.id=s.zone_id
   JOIN laboratories l ON l.id=s.lab_id
   WHERE s.id=$1 AND s.active AND z.active AND l.active
   AND s.cutoff_at>now() AND s.starts_at>now() FOR UPDATE OF s`,[id]);
  if(!r.rows[0])throw new ConflictException('SLOT_UNAVAILABLE');return r.rows[0];
 }
 private async remaining(c:PoolClient,id:string,capacity:number):Promise<number>{
  // Caller holds FOR UPDATE on collection_slots: all writers serialize on that row.
  const r=await c.query<{holds:string;booked:string}>(`SELECT
   (SELECT COUNT(*)::text FROM slot_holds h JOIN booking_drafts d ON d.id=h.draft_id
     WHERE h.slot_id=$1 AND h.expires_at>now() AND d.status='open') AS holds,
   (SELECT COUNT(*)::text FROM orders o WHERE o.slot_id=$1 AND
     (o.status IN ('confirmed','assigned','collection_in_progress','collected',
       'lab_processing','results_ready','completed')
      OR (o.status='awaiting_payment' AND o.payment_expires_at>now()))) AS booked`,[id]);
  return capacity-Number(r.rows[0]?.holds??0)-Number(r.rows[0]?.booked??0);
 }
 async catalogue(search=''){
  if(search.length>100 || /[\u0000-\u001f]/.test(search))throw new BadRequestException('Invalid search');
  const r=await this.db.query(`SELECT t.id,t.code,t.name,t.specimen_type,
   MIN(o.price_kobo)::integer AS starting_from_kobo
   FROM tests t JOIN lab_offerings o ON o.test_id=t.id AND o.active
   JOIN laboratories l ON l.id=o.lab_id AND l.active
   WHERE t.active AND (t.name ILIKE $1 OR t.code ILIKE $1)
   GROUP BY t.id,t.code,t.name,t.specimen_type ORDER BY t.name LIMIT 50`,
   ['%'+search.replace(/[%_\\]/g,'')+'%']);
  return {data:r.rows};
 }
 async zones(){
  const r=await this.db.query('SELECT id,code,name FROM service_zones WHERE active ORDER BY name');
  return {data:r.rows};
 }
 async availability(zoneId:string,labId:string,tier:'regular'|'premium'){
  const r=await this.db.query(`SELECT s.id,s.starts_at,s.ends_at,s.capacity,
   (SELECT COUNT(*)::integer FROM slot_holds h JOIN booking_drafts d ON d.id=h.draft_id
    WHERE h.slot_id=s.id AND h.expires_at>now() AND d.status='open') AS holds,
   (SELECT COUNT(*)::integer FROM orders o WHERE o.slot_id=s.id AND
    (o.status IN ('confirmed','assigned','collection_in_progress','collected',
      'lab_processing','results_ready','completed')
     OR (o.status='awaiting_payment' AND o.payment_expires_at>now()))) AS booked
   FROM collection_slots s JOIN service_zones z ON z.id=s.zone_id
   JOIN laboratories l ON l.id=s.lab_id
   WHERE s.zone_id=$1 AND s.lab_id=$2 AND s.tier=$3 AND s.active
    AND z.active AND l.active AND s.cutoff_at>now() AND s.starts_at>now()
   ORDER BY s.starts_at LIMIT 50`,[zoneId,labId,tier]);
  return {data:r.rows.map(row=>({id:row.id,startsAt:row.starts_at,endsAt:row.ends_at,
   remaining:Math.max(0,Number(row.capacity)-Number(row.holds)-Number(row.booked))}))
   .filter(slot=>slot.remaining>0)};
 }
 async quote(input:BookingQuoteInput){
  return this.tx(async c=>{
   const s=await this.slot(c,input.slotId);
   if(s.zone_id!==input.zoneId || s.lab_id!==input.labId || s.tier!==input.serviceTier)
    throw new ConflictException('Slot selection mismatch');
   if(await this.remaining(c,s.id,s.capacity)<1)throw new ConflictException('SLOT_UNAVAILABLE');
   const offering=await c.query<{test_id:string;name:string;price_kobo:number}>(`SELECT o.test_id,t.name,o.price_kobo
    FROM lab_offerings o JOIN tests t ON t.id=o.test_id
    WHERE o.lab_id=$1 AND o.test_id=ANY($2::uuid[]) AND o.active AND t.active
    ORDER BY t.name`,[input.labId,input.testIds]);
   if(offering.rows.length!==input.testIds.length)throw new ConflictException('Unsupported test');
   const zone=await c.query<{regular_fee_kobo:number;premium_fee_kobo:number}>(
    'SELECT regular_fee_kobo,premium_fee_kobo FROM service_zones WHERE id=$1 AND active',[input.zoneId]);
   if(!zone.rows[0])throw new ConflictException('Zone unavailable');
   const fee=input.serviceTier==='regular'?zone.rows[0].regular_fee_kobo:zone.rows[0].premium_fee_kobo;
   const totals=quoteTotals(offering.rows.map(v=>v.price_kobo),fee);
   const items:QuoteItem[]=offering.rows.map(v=>({testId:v.test_id,name:v.name,priceKobo:v.price_kobo}));
   const q=await c.query<{id:string;expires_at:Date}>(`INSERT INTO booking_quotes
    (zone_id,slot_id,lab_id,tier,items,tests_total_kobo,logistics_fee_kobo,total_kobo,expires_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,LEAST(now()+interval '10 minutes',$9::timestamptz))
    RETURNING id,expires_at`,[s.zone_id,s.id,s.lab_id,s.tier,JSON.stringify(items),
     totals.testsTotalKobo,totals.logisticsFeeKobo,totals.totalKobo,s.cutoff_at]);
   return {quoteId:q.rows[0]!.id,expiresAt:q.rows[0]!.expires_at,items,...totals};
  });
 }
 async getQuote(id:string){
  const r=await this.db.query(`SELECT id,zone_id,slot_id,lab_id,tier,items,tests_total_kobo,
   logistics_fee_kobo,total_kobo,expires_at
   FROM booking_quotes WHERE id=$1 AND expires_at>now()`,[id]);
  if(!r.rows[0])throw new NotFoundException('Quote unavailable');
  return {data:r.rows[0]};
 }
 async draft(subject:string,quoteId:string,patientId:string){
  return this.tx(async c=>{
   const q=await c.query<Quote>('SELECT * FROM booking_quotes WHERE id=$1',[quoteId]);
   if(!q.rows[0] || q.rows[0].expires_at<=new Date())throw new ConflictException('QUOTE_EXPIRED');
   const s=await this.slot(c,q.rows[0].slot_id);
   if(await this.remaining(c,s.id,s.capacity)<1)throw new ConflictException('SLOT_UNAVAILABLE');
   const userId=await this.actor(c,subject);
   await this.authorize(c,userId,patientId);
   const d=await c.query<{id:string}>('INSERT INTO booking_drafts(user_id,patient_id,quote_id) VALUES($1,$2,$3) RETURNING id',[userId,patientId,quoteId]);
   const h=await c.query<{expires_at:Date}>(`INSERT INTO slot_holds(draft_id,slot_id,expires_at)
    VALUES($1,$2,LEAST(now()+interval '5 minutes',$3::timestamptz)) RETURNING expires_at`,
    [d.rows[0]!.id,s.id,q.rows[0].expires_at]);
   return {draftId:d.rows[0]!.id,holdExpiresAt:h.rows[0]!.expires_at};
  });
 }
 async commit(subject:string,draftId:string){
  return this.tx(async c=>{
   const userId=await this.actor(c,subject);
   const d=(await c.query<Draft>('SELECT * FROM booking_drafts WHERE id=$1 FOR UPDATE',[draftId])).rows[0];
   if(!d || d.user_id!==userId)throw new NotFoundException('Draft not found');
   await this.authorize(c,userId,d.patient_id);
   if(d.status==='committed' && d.order_id)return {bookingId:d.order_id,status:'awaiting_payment'};
   if(d.status!=='open')throw new ConflictException('Draft no longer available');
   const q=(await c.query<Quote>('SELECT * FROM booking_quotes WHERE id=$1',[d.quote_id])).rows[0];
   if(!q || q.expires_at<=new Date())throw new ConflictException('QUOTE_EXPIRED');
   const s=await this.slot(c,q.slot_id);
   const h=(await c.query<{expires_at:Date}>(
    'SELECT expires_at FROM slot_holds WHERE draft_id=$1 AND slot_id=$2 FOR UPDATE',[d.id,s.id])).rows[0];
   if(!h || h.expires_at<=new Date())throw new ConflictException('SLOT_HOLD_EXPIRED');
   if(await this.remaining(c,s.id,s.capacity)<0)throw new ConflictException('SLOT_UNAVAILABLE');
   const o=await c.query<{id:string}>(`INSERT INTO orders(patient_id,booked_by,lab_id,status,tier,
    currency,total_kobo,collection_window_start,collection_window_end,slot_id,quote_id,booking_draft_id,payment_expires_at)
    VALUES($1,$2,$3,'awaiting_payment',$4,'NGN',$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [d.patient_id,userId,q.lab_id,q.tier,q.total_kobo,s.starts_at,s.ends_at,s.id,q.id,d.id,q.expires_at]);
   const id=o.rows[0]!.id;
   for(const item of q.items){
    await c.query('INSERT INTO order_items(order_id,test_id,price_kobo) VALUES($1,$2,$3)',
     [id,item.testId,item.priceKobo]);
   }
   await c.query("UPDATE booking_drafts SET status='committed',order_id=$2,updated_at=now() WHERE id=$1",[d.id,id]);
   await c.query('DELETE FROM slot_holds WHERE draft_id=$1',[d.id]);
   await c.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id) VALUES($1,'booking.created','order',$2)",[userId,id]);
   return {bookingId:id,status:'awaiting_payment',paymentExpiresAt:q.expires_at};
  });
 }
 async booking(subject:string,id:string){
  const r=await this.db.query(`SELECT o.id,o.status,o.tier,o.currency,o.total_kobo,
   o.collection_window_start,o.collection_window_end,o.created_at
   FROM orders o WHERE o.id=$2 AND EXISTS
   (SELECT 1 FROM patient_relationships rel JOIN users u ON u.id=rel.user_id
    WHERE rel.patient_id=o.patient_id AND u.identity_subject=$1 AND rel.can_book
    AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL)`,[subject,id]);
  if(!r.rows[0])throw new NotFoundException('Booking not found');return {data:r.rows[0]};
 }
 async history(subject:string){
  const r=await this.db.query(`SELECT DISTINCT o.id,o.status,o.tier,o.total_kobo,o.currency,o.created_at
   FROM orders o JOIN patient_relationships rel ON rel.patient_id=o.patient_id
   JOIN users u ON u.id=rel.user_id WHERE u.identity_subject=$1
   AND rel.can_book AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
   ORDER BY o.created_at DESC LIMIT 50`,[subject]);
  return {data:r.rows};
 }
 async cancel(subject:string,id:string){
  return this.tx(async c=>{
   const userId=await this.actor(c,subject);
   const o=(await c.query<{patient_id:string;status:string}>(
    'SELECT patient_id,status FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!o)throw new NotFoundException('Booking not found');
   await this.authorize(c,userId,o.patient_id);
   if(o.status==='cancelled')return {bookingId:id,status:'cancelled'};
   if(o.status!=='awaiting_payment')throw new ConflictException('Contact support for paid cancellation');
   const p=await c.query("SELECT 1 FROM payments WHERE order_id=$1 AND status IN ('paid','success')",[id]);
   if(p.rows.length)throw new ConflictException('Refund review required');
   await c.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1",[id]);
   await c.query("INSERT INTO audit_events(actor_id,action,resource_type,resource_id) VALUES($1,'booking.cancelled','order',$2)",[userId,id]);
   return {bookingId:id,status:'cancelled'};
  });
 }
 async checkoutOrder(subject:string,id:string){
  const r=await this.db.query<{id:string;status:string;total_kobo:number;payment_expires_at:Date;email:string|null}>(`SELECT
   o.id,o.status,o.total_kobo,o.payment_expires_at,u.email FROM orders o
   JOIN users u ON u.id=o.booked_by WHERE o.id=$1 AND u.identity_subject=$2
   AND EXISTS(SELECT 1 FROM patient_relationships rel WHERE rel.user_id=u.id
   AND rel.patient_id=o.patient_id AND rel.can_book AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL)`,[id,subject]);
  if(!r.rows[0])throw new NotFoundException('Booking not found');
  if(r.rows[0].status!=='awaiting_payment' || r.rows[0].payment_expires_at<=new Date())
   throw new ConflictException('Checkout expired');
  return r.rows[0];
 }
 async payment(subject:string,id:string){
  const r=await this.db.query(`SELECT p.id,p.status,p.amount_kobo,o.id AS booking_id FROM payments p
   JOIN orders o ON o.id=p.order_id JOIN patient_relationships rel ON rel.patient_id=o.patient_id
   JOIN users u ON u.id=rel.user_id WHERE p.id=$1 AND u.identity_subject=$2 AND rel.can_book
   AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL`,[id,subject]);
  if(!r.rows[0])throw new NotFoundException('Payment not found');return {data:r.rows[0]};
 }
}
