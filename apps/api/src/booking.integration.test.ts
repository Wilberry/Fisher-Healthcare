import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { BookingService } from './booking.service';
import { PaymentService } from './payment.service';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'
  && process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('phase 2 synthetic booking and payment PostgreSQL invariants',()=>{
 const one={sub:'synthetic-a-'+randomUUID(),id:randomUUID(),patientId:randomUUID()};
 const two={sub:'synthetic-b-'+randomUUID(),id:randomUUID(),patientId:randomUUID()};
 const labId=randomUUID(),testId=randomUUID(),zoneId=randomUUID(),slotId=randomUUID();
 let pool:Pool,bookings:BookingService,payments:PaymentService;
 let winner:{sub:string;draftId:string;bookingId:string};
 const env={
  mode:process.env.FISHER_PHASE2_BOOKING_MODE,
  payment:process.env.FISHER_PHASE2_PAYMENT_MODE,
  key:process.env.PAYSTACK_SECRET_KEY
 };
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL || process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')
   throw new Error('Dedicated disposable database required');
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
  const r=await pool.query('SELECT current_database() AS database_name');
  if(r.rows[0]?.database_name!=='fisher_test')
   throw new Error('Refusing to run booking integration outside fisher_test');
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  process.env.FISHER_PHASE2_PAYMENT_MODE='staging';
  process.env.PAYSTACK_SECRET_KEY='sk_test_synthetic_fisher_phase2';
  bookings=new BookingService();
  payments=new PaymentService(bookings);
  for(const u of [one,two]){
   await pool.query('INSERT INTO users(id,identity_subject,email) VALUES($1,$2,$3)',
    [u.id,u.sub,'synthetic'+u.id.slice(0,6)+'@example.test']);
   await pool.query('INSERT INTO patients(id,display_name) VALUES($1,$2)',[u.patientId,'Synthetic booking patient']);
   await pool.query(`INSERT INTO patient_relationships(user_id,patient_id,relationship,
    can_book,can_view_results,verified_at) VALUES($1,$2,'self',true,false,now())`,
    [u.id,u.patientId]);
  }
  await pool.query("INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic Laboratory',true)",[labId]);
  await pool.query("INSERT INTO tests(id,code,name,specimen_type,active) VALUES($1,$2,'Synthetic Test','blood',true)",
   [testId,'synthetic-'+testId]);
  await pool.query(`INSERT INTO lab_offerings(lab_id,test_id,price_kobo,turnaround_hours,active)
   VALUES($1,$2,25000,24,true)`,[labId,testId]);
  await pool.query(`INSERT INTO service_zones(id,code,name,active,regular_fee_kobo,premium_fee_kobo)
   VALUES($1,$2,'Synthetic Zone',true,10000,20000)`,[zoneId,'synthetic-'+zoneId]);
  await pool.query(`INSERT INTO collection_slots(id,zone_id,lab_id,tier,starts_at,ends_at,cutoff_at,capacity,active)
   VALUES($1,$2,$3,'regular',now()+interval '1 day',now()+interval '1 day 1 hour',
    now()+interval '12 hours',1,true)`,[slotId,zoneId,labId]);
 });
 afterAll(async()=>{
  vi.unstubAllGlobals();
  await payments?.onModuleDestroy();
  await bookings?.onModuleDestroy();
  await pool?.end();
  for(const [k,v] of Object.entries({FISHER_PHASE2_BOOKING_MODE:env.mode,FISHER_PHASE2_PAYMENT_MODE:env.payment,PAYSTACK_SECRET_KEY:env.key})){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 });
 it('issues immutable quote totals from active lab offerings',async()=>{
  const q=await bookings.quote({zoneId,slotId,labId,serviceTier:'regular',testIds:[testId]});
  expect(q.totalKobo).toBe(35000);
  expect(q.testsTotalKobo).toBe(25000);
  const stored=await pool.query('SELECT total_kobo,items FROM booking_quotes WHERE id=$1',[q.quoteId]);
  expect(stored.rows[0].total_kobo).toBe(35000);
  expect(stored.rows[0].items).toHaveLength(1);
 });
 it('locks capacity so two concurrent patient holds cannot oversell the final slot',async()=>{
  const q=await Promise.all([one,two].map(()=>bookings.quote({
   zoneId,slotId,labId,serviceTier:'regular',testIds:[testId]
  })));
  const attempts=await Promise.allSettled([
   bookings.draft(one.sub,q[0]!.quoteId,one.patientId),
   bookings.draft(two.sub,q[1]!.quoteId,two.patientId)
  ]);
  expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
  const index=attempts[0]!.status==='fulfilled'?0:1;
  const who=[one,two][index]!;
  const draft=attempts[index] as PromiseFulfilledResult<{draftId:string;holdExpiresAt:Date}>;
  const result=await bookings.commit(who.sub,draft.value.draftId);
  winner={sub:who.sub,draftId:draft.value.draftId,bookingId:result.bookingId};
  expect(result.status).toBe('awaiting_payment');
  const second=await bookings.commit(who.sub,draft.value.draftId);
  expect(second.bookingId).toBe(result.bookingId);
  const orders=await pool.query('SELECT COUNT(*)::integer AS count FROM orders WHERE slot_id=$1',[slotId]);
  expect(orders.rows[0].count).toBe(1);
 });
 it('refuses an expired price even if the slot has capacity',async()=>{
  const extraSlot=randomUUID();
  await pool.query(`INSERT INTO collection_slots(id,zone_id,lab_id,tier,starts_at,ends_at,cutoff_at,capacity,active)
   VALUES($1,$2,$3,'regular',now()+interval '2 days',now()+interval '2 days 1 hour',
   now()+interval '24 hours',1,true)`,[extraSlot,zoneId,labId]);
  const q=await bookings.quote({zoneId,slotId:extraSlot,labId,serviceTier:'regular',testIds:[testId]});
  await pool.query("UPDATE booking_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",[q.quoteId]);
  await expect(bookings.draft(one.sub,q.quoteId,one.patientId)).rejects.toThrow('QUOTE_EXPIRED');
 });
 it('verifies a synthetic webhook twice without duplicate ledger entries or reservations',async()=>{
  const originalFetch=globalThis.fetch;
  vi.stubGlobal('fetch',vi.fn(async (url:string,options?:RequestInit)=>{
   if(url.endsWith('/transaction/initialize')){
    const b=JSON.parse(String(options?.body)) as {reference:string};
    return {ok:true,json:async()=>({status:true,data:{
     authorization_url:'https://checkout.paystack.com/synthetic-checkout',
     reference:b.reference
    }})};
   }
   if(url.includes('/transaction/verify/')){
    const reference=decodeURIComponent(url.split('/').at(-1)!);
    return {ok:true,json:async()=>({data:{
     reference,amount:35000,currency:'NGN',status:'success',paid_at:'2026-10-16T00:00:00Z'
    }})};
   }
   throw new Error('Unexpected external call');
  }));
  try{
   const checkout=await payments.checkout(winner.sub,winner.bookingId);
   const reference=(await pool.query('SELECT provider_reference FROM payments WHERE id=$1',[checkout.paymentId])).rows[0].provider_reference as string;
   const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference}}));
   const signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(raw).digest('hex');
   await payments.webhook(raw,signature);
   await payments.webhook(raw,signature);
   const entries=await pool.query('SELECT amount_kobo FROM ledger_entries WHERE transaction_id=$1',[checkout.paymentId]);
   expect(entries.rows.map(r=>r.amount_kobo).sort((a:number,b:number)=>a-b)).toEqual([-35000,35000]);
   const after=await pool.query('SELECT status FROM orders WHERE id=$1',[winner.bookingId]);
   expect(after.rows[0].status).toBe('confirmed');
   const events=await pool.query('SELECT COUNT(*)::integer AS count FROM payment_webhook_events WHERE provider_reference=$1',[reference]);
   expect(events.rows[0].count).toBe(1);
  }finally{vi.stubGlobal('fetch',originalFetch);}
 });
 it('does not grant caregivers result rights through booking access',async()=>{
  const relationship=await pool.query('SELECT can_book,can_view_results FROM patient_relationships WHERE user_id=$1',[one.id]);
  expect(relationship.rows[0]).toMatchObject({can_book:true,can_view_results:false});
 });
});
