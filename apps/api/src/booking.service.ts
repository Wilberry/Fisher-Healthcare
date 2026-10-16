import { Injectable, OnModuleDestroy, BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { quoteTotals, type BookingQuoteInput, type QuoteItem } from '@fisher/contracts';

type Slot={id:string;zone_id:string;lab_id:string;tier:'regular'|'premium';capacity:number;cutoff_at:Date;starts_at:Date;ends_at:Date};
type Quote={id:string;zone_id:string;slot_id:string;lab_id:string;tier:'regular'|'premium';items:QuoteItem[];total_kobo:number;expires_at:Date};
type Draft={id:string;quote_id:string;patient_id:string;user_id:string;status:string;order_id:string|null;commit_key:string|null;address_id:string|null};

@Injectable()
export class BookingService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:8});}
 async onModuleDestroy(){await this.pool?.end();}
 private bookingEnabled(){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Booking is not activated');
 }
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
 private async approvedAddress(c:PoolClient,addressId:string,patientId:string,userId:string,zoneId:string){
  const r=await c.query<{id:string;zone_id:string;label:string;address_line:string;locality:string}>(`SELECT
   a.id,a.zone_id,a.label,a.address_line,a.locality FROM patient_addresses a
   JOIN service_zones z ON z.id=a.zone_id
   WHERE a.id=$1 AND a.patient_id=$2 AND a.owner_user_id=$3
    AND a.zone_id=$4 AND a.verified_at IS NOT NULL AND a.revoked_at IS NULL
    AND z.active=true FOR SHARE OF a`,[addressId,patientId,userId,zoneId]);
  if(!r.rows[0])throw new ConflictException('COLLECTION_ADDRESS_NOT_VERIFIED');
  return r.rows[0];
 }
 private async slot(c:PoolClient,id:string):Promise<Slot>{
  const r=await c.query<Slot>(`SELECT s.id,s.zone_id,s.lab_id,s.tier,s.capacity,s.cutoff_at,s.starts_at,s.ends_at
   FROM collection_slots s JOIN service_zones z ON z.id=s.zone_id
   JOIN laboratories l ON l.id=s.lab_id
   WHERE s.id=$1 AND s.active AND z.active AND l.active
   AND s.cutoff_at>clock_timestamp() AND s.starts_at>clock_timestamp() FOR UPDATE OF s`,[id]);
  if(!r.rows[0])throw new ConflictException('SLOT_UNAVAILABLE');return r.rows[0];
 }
 private async remaining(c:PoolClient,id:string,capacity:number):Promise<number>{
  // Caller holds FOR UPDATE on collection_slots: all writers serialize on that row.
  const r=await c.query<{holds:string;booked:string}>(`SELECT
   (SELECT COUNT(*)::text FROM slot_holds h JOIN booking_drafts d ON d.id=h.draft_id
     WHERE h.slot_id=$1 AND h.expires_at>clock_timestamp() AND d.status='open') AS holds,
   (SELECT COUNT(*)::text FROM orders o WHERE o.slot_id=$1 AND
     (o.status IN ('confirmed','assigned','collection_in_progress','collected',
       'lab_processing','results_ready','completed')
      OR (o.status='awaiting_payment' AND o.payment_expires_at>clock_timestamp()))) AS booked`,[id]);
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
 async labs(){
  const r=await this.db.query(`SELECT l.id,l.name,
   COUNT(o.id)::integer AS active_offerings FROM laboratories l
   JOIN lab_offerings o ON o.lab_id=l.id AND o.active
   JOIN tests t ON t.id=o.test_id AND t.active
   WHERE l.active GROUP BY l.id,l.name ORDER BY l.name LIMIT 50`);
  return {data:r.rows};
 }
 async testDetails(id:string){
  const r=await this.db.query(`SELECT t.id,t.name,t.code,t.specimen_type,t.preparation_text,
   json_agg(json_build_object('labId',l.id,'labName',l.name,
    'priceKobo',o.price_kobo,'turnaroundHours',o.turnaround_hours)
    ORDER BY l.name) AS offerings
   FROM tests t JOIN lab_offerings o ON o.test_id=t.id AND o.active
   JOIN laboratories l ON l.id=o.lab_id AND l.active
   WHERE t.id=$1 AND t.active GROUP BY t.id,t.name,t.code,t.specimen_type,t.preparation_text`,[id]);
  if(!r.rows[0])throw new NotFoundException('Test not offered');
  return {data:r.rows[0]};
 }
 async zones(){
  const r=await this.db.query('SELECT id,code,name FROM service_zones WHERE active ORDER BY name');
  return {data:r.rows};
 }
 async availability(zoneId:string,labId:string,tier:'regular'|'premium'){
  const r=await this.db.query(`SELECT s.id,s.starts_at,s.ends_at,s.capacity,
   (SELECT COUNT(*)::integer FROM slot_holds h JOIN booking_drafts d ON d.id=h.draft_id
    WHERE h.slot_id=s.id AND h.expires_at>clock_timestamp() AND d.status='open') AS holds,
   (SELECT COUNT(*)::integer FROM orders o WHERE o.slot_id=s.id AND
    (o.status IN ('confirmed','assigned','collection_in_progress','collected',
      'lab_processing','results_ready','completed')
     OR (o.status='awaiting_payment' AND o.payment_expires_at>clock_timestamp()))) AS booked
   FROM collection_slots s JOIN service_zones z ON z.id=s.zone_id
   JOIN laboratories l ON l.id=s.lab_id
   WHERE s.zone_id=$1 AND s.lab_id=$2 AND s.tier=$3 AND s.active
    AND z.active AND l.active AND s.cutoff_at>clock_timestamp() AND s.starts_at>clock_timestamp()
   ORDER BY s.starts_at LIMIT 50`,[zoneId,labId,tier]);
  return {data:r.rows.map(row=>({id:row.id,startsAt:row.starts_at,endsAt:row.ends_at,
   remaining:Math.max(0,Number(row.capacity)-Number(row.holds)-Number(row.booked))}))
   .filter(slot=>slot.remaining>0)};
 }
 async quote(input:BookingQuoteInput){
  this.bookingEnabled();
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
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,LEAST(clock_timestamp()+interval '10 minutes',$9::timestamptz))
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
 async draft(subject:string,quoteId:string,patientId:string,addressId:string){
  this.bookingEnabled();
  return this.tx(async c=>{
   const q=await c.query<Quote>('SELECT * FROM booking_quotes WHERE id=$1',[quoteId]);
   if(!q.rows[0] || q.rows[0].expires_at<=new Date())throw new ConflictException('QUOTE_EXPIRED');
   const s=await this.slot(c,q.rows[0].slot_id);
   if(await this.remaining(c,s.id,s.capacity)<1)throw new ConflictException('SLOT_UNAVAILABLE');
   const userId=await this.actor(c,subject);
   await this.authorize(c,userId,patientId);
   await this.approvedAddress(c,addressId,patientId,userId,q.rows[0].zone_id);
   const d=await c.query<{id:string}>('INSERT INTO booking_drafts(user_id,patient_id,quote_id,address_id) VALUES($1,$2,$3,$4) RETURNING id',[userId,patientId,quoteId,addressId]);
   const h=await c.query<{expires_at:Date}>(`INSERT INTO slot_holds(draft_id,slot_id,expires_at)
    VALUES($1,$2,LEAST(clock_timestamp()+interval '5 minutes',$3::timestamptz)) RETURNING expires_at`,
    [d.rows[0]!.id,s.id,q.rows[0].expires_at]);
   return {draftId:d.rows[0]!.id,holdExpiresAt:h.rows[0]!.expires_at};
  });
 }
 async commit(subject:string,draftId:string,key:string){
  this.bookingEnabled();
  return this.tx(async c=>{
   const userId=await this.actor(c,subject);
   const d=(await c.query<Draft>('SELECT * FROM booking_drafts WHERE id=$1 FOR UPDATE',[draftId])).rows[0];
   if(!d || d.user_id!==userId)throw new NotFoundException('Draft not found');
   await this.authorize(c,userId,d.patient_id);
   if(d.commit_key && d.commit_key!==key)throw new ConflictException('Idempotency key mismatch');
   if(d.status==='committed' && d.order_id){
    const existing=await c.query<{status:string}>('SELECT status FROM orders WHERE id=$1',[d.order_id]);
    return {bookingId:d.order_id,status:existing.rows[0]?.status??'unknown'};
   }
   if(d.status!=='open')throw new ConflictException('Draft no longer available');
   const reuse=await c.query('SELECT 1 FROM booking_drafts WHERE user_id=$1 AND commit_key=$2 AND id<>$3',[userId,key,d.id]);
   if(reuse.rows.length)throw new ConflictException('Idempotency key already used');
   await c.query('UPDATE booking_drafts SET commit_key=$2 WHERE id=$1',[d.id,key]);
   const q=(await c.query<Quote>('SELECT * FROM booking_quotes WHERE id=$1',[d.quote_id])).rows[0];
   if(!q || q.expires_at<=new Date())throw new ConflictException('QUOTE_EXPIRED');
   const s=await this.slot(c,q.slot_id);
   if(!d.address_id)throw new ConflictException('Booking draft has no address');
   const address=await this.approvedAddress(c,d.address_id,d.patient_id,userId,q.zone_id);
   const h=(await c.query<{expires_at:Date}>(
    'SELECT expires_at FROM slot_holds WHERE draft_id=$1 AND slot_id=$2 FOR UPDATE',[d.id,s.id])).rows[0];
   if(!h || h.expires_at<=new Date())throw new ConflictException('SLOT_HOLD_EXPIRED');
   if(await this.remaining(c,s.id,s.capacity)<0)throw new ConflictException('SLOT_UNAVAILABLE');
   const o=await c.query<{id:string}>(`INSERT INTO orders(patient_id,booked_by,lab_id,status,tier,
    currency,total_kobo,collection_window_start,collection_window_end,slot_id,quote_id,booking_draft_id,payment_expires_at,
    collection_address_id,collection_address_snapshot)
    VALUES($1,$2,$3,'awaiting_payment',$4,'NGN',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING id`,
    [d.patient_id,userId,q.lab_id,q.tier,q.total_kobo,s.starts_at,s.ends_at,s.id,q.id,d.id,q.expires_at,address.id,JSON.stringify({
    zoneId:address.zone_id,label:address.label,addressLine:address.address_line,locality:address.locality
   })]);
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
 async notifications(subject:string){
  const r=await this.db.query(`SELECT n.id,n.channel,n.template,n.status,n.created_at,n.sent_at,
   n.order_id AS booking_id FROM notification_intents n JOIN orders o ON o.id=n.order_id
   WHERE EXISTS(SELECT 1 FROM patient_relationships rel JOIN users u ON u.id=rel.user_id
   WHERE rel.patient_id=o.patient_id AND u.identity_subject=$1 AND rel.can_book
     AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL)
   ORDER BY n.created_at DESC LIMIT 50`,[subject]);
  return {data:r.rows};
 }
 async history(subject:string){
  const r=await this.db.query(`SELECT DISTINCT o.id,o.status,o.tier,o.total_kobo,o.currency,o.created_at
   FROM orders o JOIN patient_relationships rel ON rel.patient_id=o.patient_id
   JOIN users u ON u.id=rel.user_id WHERE u.identity_subject=$1
   AND rel.can_book AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
   ORDER BY o.created_at DESC LIMIT 50`,[subject]);
  return {data:r.rows};
 }
 async reschedule(subject:string,id:string,newSlotId:string,key:string){
  this.bookingEnabled();
  return this.tx(async c=>{
   const userId=await this.actor(c,subject);
   // Read the immutable source reference, then lock affected slots in deterministic order.
   const initial=await c.query<{slot_id:string;lab_id:string;patient_id:string;tier:string}>(
    'SELECT slot_id,lab_id,patient_id,tier FROM orders WHERE id=$1',[id]);
   if(!initial.rows[0]?.slot_id)throw new NotFoundException('Booking not found');
   const currentSlot=initial.rows[0].slot_id;
   for(const slotId of [...new Set([currentSlot,newSlotId])].sort()){
    await c.query('SELECT id FROM collection_slots WHERE id=$1 FOR UPDATE',[slotId]);
   }
   const order=await c.query<{slot_id:string;lab_id:string;patient_id:string;tier:string;status:string;payment_expires_at:Date}>(
    'SELECT slot_id,lab_id,patient_id,tier,status,payment_expires_at FROM orders WHERE id=$1 FOR UPDATE',[id]);
   const o=order.rows[0];
   if(!o || o.slot_id!==currentSlot)throw new ConflictException('Booking schedule changed');
   await this.authorize(c,userId,o.patient_id);
   const prior=await c.query<{to_slot_id:string}>(
    'SELECT to_slot_id FROM booking_schedule_changes WHERE order_id=$1 AND idempotency_key=$2',[id,key]);
   if(prior.rows[0]){
    if(prior.rows[0].to_slot_id!==newSlotId)throw new ConflictException('Idempotency key mismatch');
    return {bookingId:id,slotId:prior.rows[0].to_slot_id,status:o.status};
   }
   if(o.status!=='awaiting_payment' || o.payment_expires_at<=new Date())
    throw new ConflictException('Rescheduling requires support review');
   const attempts=await c.query('SELECT 1 FROM payments WHERE order_id=$1',[id]);
   if(attempts.rows.length)throw new ConflictException('Payment started; contact support for rescheduling');
   const next=await this.slot(c,newSlotId);
   // Preserve contracted zone, laboratory, service tier, and fee; never silently upgrade.
   const existing=await c.query<{zone_id:string}>('SELECT zone_id FROM collection_slots WHERE id=$1',[currentSlot]);
   if(next.id===currentSlot || next.zone_id!==existing.rows[0]?.zone_id ||
      next.lab_id!==o.lab_id || next.tier!==o.tier)
    throw new ConflictException('Choose an alternative compatible slot');
   if(await this.remaining(c,next.id,next.capacity)<1)throw new ConflictException('SLOT_UNAVAILABLE');
   await c.query(`UPDATE orders SET slot_id=$2,collection_window_start=$3,
     collection_window_end=$4,updated_at=now() WHERE id=$1`,[id,newSlotId,next.starts_at,next.ends_at]);
   await c.query(`INSERT INTO booking_schedule_changes(order_id,from_slot_id,to_slot_id,idempotency_key,actor_id)
     VALUES($1,$2,$3,$4,$5)`,[id,currentSlot,newSlotId,key,userId]);
   await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'booking.rescheduled','order',$2,jsonb_build_object('fromSlot',$3,'toSlot',$4))`,
     [userId,id,currentSlot,newSlotId]);
   return {bookingId:id,slotId:newSlotId,status:'awaiting_payment'};
  });
 }
 async receipt(subject:string,id:string){
  const r=await this.db.query(`SELECT o.id AS booking_id,o.currency,o.total_kobo,o.tier,
   p.id AS payment_id,p.provider_reference,p.updated_at AS paid_at
   FROM orders o JOIN payments p ON p.order_id=o.id AND p.status='paid'
   WHERE o.id=$2 AND EXISTS(
    SELECT 1 FROM patient_relationships rel JOIN users u ON u.id=rel.user_id
    WHERE u.identity_subject=$1 AND rel.patient_id=o.patient_id AND rel.can_book
      AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL)`,[subject,id]);
  if(!r.rows[0])throw new NotFoundException('Receipt unavailable');
  return {data:r.rows[0]};
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
   const p=await c.query('SELECT 1 FROM payments WHERE order_id=$1',[id]);
   if(p.rows.length)throw new ConflictException('Payment started; cancellation requires support review');
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
