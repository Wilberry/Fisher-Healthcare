import { randomBytes,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Pool } from 'pg';
import { AccessService } from './access.service';
import { GuestBookingService,guestStartInput } from './guest-booking.service';
import { guestBookingHandlers } from '../../worker/src/booking-notifications';
import type { AuthenticatedIdentity } from './identity';
const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&process.env.DATABASE_URL?
 describe:describe.skip;
suite.sequential('verified synthetic guest-assisted intake',()=>{
 const labId=randomUUID(),zoneId=randomUUID(),slotId=randomUUID(),quoteId=randomUUID();
 const reviewer='synthetic-guest-review-'+randomUUID();
 const emails=['synthetic-guest-1@example.test','synthetic-guest-2@example.test'];
 let db:Pool,access:AccessService,service:GuestBookingService;
 let lastCode='',send:ReturnType<typeof vi.fn>;
 const config=[
  'FISHER_PHASE2_BOOKING_MODE','FISHER_PHASE2_EMAIL_MODE',
  'FISHER_STAGING_EMAIL_FROM','FISHER_STAGING_EMAIL_ALLOWLIST',
  'FISHER_GUEST_CODE_PEPPER','RESEND_API_KEY'
 ] as const;
 const originals:Record<string,string|undefined>={};
 const reviewerIdentity:AuthenticatedIdentity={subject:reviewer,issuer:'https://synthetic.example.test',authenticationMethods:['mfa']};
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('No synthetic DB');
  db=new Pool({connectionString:process.env.DATABASE_URL,max:4});
  if((await db.query('SELECT current_database() AS name')).rows[0]?.name!=='fisher_test')
   throw new Error('Refusing non-synthetic database');
  for(const key of config)originals[key]=process.env[key];
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  process.env.FISHER_PHASE2_EMAIL_MODE='staging';
  process.env.FISHER_STAGING_EMAIL_FROM='sandbox@example.test';
  process.env.FISHER_STAGING_EMAIL_ALLOWLIST=emails.join(',');
  process.env.FISHER_GUEST_CODE_PEPPER=randomBytes(32).toString('base64url');
  process.env.RESEND_API_KEY='re_synthetic_test_only';
  send=vi.fn(async (_url:string,opts:RequestInit)=>{
   const msg=JSON.parse(String(opts.body)) as {text:string};
   const result=msg.text.match(/code is ([0-9]{8})/);
   if(!result)throw Error('No guest verification code');
   lastCode=result[1]!;
   return new Response(JSON.stringify({id:'synthetic-accepted-id'}),{status:200});
  });
  vi.stubGlobal('fetch',send);
  access=new AccessService();service=new GuestBookingService(access);
  const user=(await db.query<{id:string}>('INSERT INTO users(identity_subject) VALUES($1) RETURNING id',[reviewer])).rows[0]!;
  await db.query("INSERT INTO staff(user_id,role,active) VALUES($1,'administrator',true)",[user.id]);
  await db.query("INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic guest laboratory',true)",[labId]);
  await db.query(`INSERT INTO service_zones(id,code,name,active,regular_fee_kobo,premium_fee_kobo)
   VALUES($1,$2,'Synthetic guest zone',true,1000,2000)`,[zoneId,'guest-'+zoneId]);
  await db.query(`INSERT INTO collection_slots(id,zone_id,lab_id,tier,starts_at,ends_at,cutoff_at,capacity,active)
   VALUES($1,$2,$3,'regular',now()+interval '2 days',now()+interval '2 days 1 hour',
    now()+interval '1 day',1,true)`,[slotId,zoneId,labId]);
  await db.query(`INSERT INTO booking_quotes(id,zone_id,slot_id,lab_id,tier,items,
   tests_total_kobo,logistics_fee_kobo,total_kobo,expires_at)
   VALUES($1,$2,$3,$4,'regular','[]'::jsonb,1000,1000,2000,clock_timestamp()+interval '10 minutes')`,
   [quoteId,zoneId,slotId,labId]);
 });
 afterAll(async()=>{
  vi.unstubAllGlobals();
  await service?.onModuleDestroy();await access?.onModuleDestroy();await db?.end();
  for(const key of config){if(originals[key]===undefined)delete process.env[key];else process.env[key]=originals[key];}
 });
 it('rejects a guest request without explicit synthetic policy acknowledgment',async()=>{
  expect(guestStartInput.safeParse({email:emails[0],quoteId}).success).toBe(false);
 });
 it('disallows unapproved recipients before sending an email',async()=>{
  await expect(service.start({email:'unapproved@example.test',quoteId,policyAccepted:true,policyVersion:'synthetic-2026-10'})).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
 });
 it('records a one-time code and creates exactly one work item after verification',async()=>{
  const started=await service.start({email:emails[0],quoteId,policyAccepted:true,policyVersion:'synthetic-2026-10'});
  expect(started.status).toBe('email_verification_required');
  const dbCode=await db.query('SELECT code_hash,verified_at FROM guest_booking_requests WHERE id=$1',[started.requestId]);
  expect(dbCode.rows[0].code_hash).not.toBe(lastCode);
  expect(dbCode.rows[0].verified_at).toBeNull();
  const invalidCode=lastCode==='00000000'?'00000001':'00000000';
  await expect(service.verify({requestId:started.requestId,code:invalidCode})).rejects.toThrow();
  const attempts=await db.query('SELECT attempts FROM guest_booking_requests WHERE id=$1',[started.requestId]);
  expect(attempts.rows[0].attempts).toBe(1);
  const verified=await service.verify({requestId:started.requestId,code:lastCode});
  expect(verified.status).toBe('pending_review');
  await service.verify({requestId:started.requestId,code:lastCode});
  const events=await db.query(`SELECT COUNT(*)::integer AS count FROM outbox
    WHERE event_type='guest.booking_verified' AND payload->>'requestId'=$1`,[started.requestId]);
  expect(events.rows[0].count).toBe(1);
  const handler=guestBookingHandlers(db)['guest.booking_verified']!;
  await handler({requestId:started.requestId});await handler({requestId:started.requestId});
  const queued=await db.query('SELECT count(*)::integer AS count FROM guest_booking_work_items WHERE request_id=$1',[started.requestId]);
  expect(queued.rows[0].count).toBe(1);
  await expect(service.assign({...reviewerIdentity,authenticationMethods:[]},
    started.requestId,'synthetic-guest-review-ref')).rejects.toThrow();
  const assigned=await service.assign(reviewerIdentity,started.requestId,'synthetic-guest-review-ref');
  expect(assigned.status).toBe('in_review');
  const noPatient=await db.query("SELECT count(*)::integer AS count FROM patients WHERE display_name='Guest booking patient'");
  expect(noPatient.rows[0].count).toBe(0);
 });
 it('limits short-lived guest requests for one mailbox',async()=>{
  for(let i=0;i<3;i++)await service.start({email:emails[1],quoteId,policyAccepted:true,policyVersion:'synthetic-2026-10'});
  await expect(service.start({email:emails[1],quoteId,policyAccepted:true,policyVersion:'synthetic-2026-10'})).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(4);
 });
});
