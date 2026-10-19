import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { SupportService } from './support.service';
import { AccessService } from './access.service';
import { supportCaseInput } from '@fisher/contracts';
import { supportCaseHandlers } from '../../worker/src/booking-notifications';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only' && process.env.DATABASE_URL
 ?describe:describe.skip;
suite.sequential('synthetic customer support and durable staff work-item isolation',()=>{
 const owner='synthetic-support-owner-'+randomUUID();
 const stranger='synthetic-support-stranger-'+randomUUID();
 const labId=randomUUID(),patientId=randomUUID(),orderId=randomUUID();
 let db:Pool,support:SupportService,access:AccessService;
 const original=process.env.FISHER_PHASE2_BOOKING_MODE;
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('No disposable database');
  db=new Pool({connectionString:process.env.DATABASE_URL,max:4});
  const result=await db.query('SELECT current_database() AS db');
  if(result.rows[0]?.db!=='fisher_test')throw new Error('Unsafe test database');
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  access=new AccessService();support=new SupportService(access);
  await db.query('INSERT INTO users(identity_subject) VALUES($1),($2)',[owner,stranger]);
  const row=await db.query('SELECT id FROM users WHERE identity_subject=$1',[owner]);
  const userId=row.rows[0].id as string;
  await db.query("INSERT INTO patients(id,display_name) VALUES($1,'Synthetic support patient')",[patientId]);
  await db.query("INSERT INTO laboratories(id,name) VALUES($1,'Synthetic support laboratory')",[labId]);
  await db.query(`INSERT INTO patient_relationships(user_id,patient_id,relationship,can_book,can_view_results,verified_at)
   VALUES($1,$2,'self',true,false,now())`,[userId,patientId]);
  await db.query(`INSERT INTO orders(id,patient_id,booked_by,lab_id,tier,total_kobo)
   VALUES($1,$2,$3,$4,'regular',0)`,[orderId,patientId,userId,labId]);
 });
 afterAll(async()=>{
  await support?.onModuleDestroy();await access?.onModuleDestroy();await db?.end();
  if(original===undefined)delete process.env.FISHER_PHASE2_BOOKING_MODE;
  else process.env.FISHER_PHASE2_BOOKING_MODE=original;
 });
 it('rejects clinical or arbitrary message payloads on the support intake schema',()=>{
  expect(supportCaseInput.safeParse({category:'booking',preferredContact:'whatsapp'}).success).toBe(true);
  expect(supportCaseInput.safeParse({category:'booking',preferredContact:'email',
   clinicalDetails:'Should not be collected'}).success).toBe(false);
 });
 it('denies a stranger access to someone else’s booking reference',async()=>{
  await expect(support.create(stranger,{category:'booking',preferredContact:'email',bookingId:orderId},
   'synthetic_stranger_key_01')).rejects.toThrow();
 });
 it('coalesces concurrent same-key support submissions into one case',async()=>{
  const input={category:'booking' as const,preferredContact:'whatsapp' as const,bookingId:orderId};
  const results=await Promise.all([
   support.create(owner,input,'synthetic_support_request_01'),
   support.create(owner,input,'synthetic_support_request_01')
  ]);
  expect(results[0].caseId).toBe(results[1].caseId);
  const cases=await db.query('SELECT COUNT(*)::integer AS count FROM support_cases WHERE id=$1',[results[0].caseId]);
  expect(cases.rows[0].count).toBe(1);
  const outbox=await db.query(`SELECT COUNT(*)::integer AS count FROM outbox
   WHERE event_type='support.case_opened' AND payload->>'caseId'=$1`,[results[0].caseId]);
  expect(outbox.rows[0].count).toBe(1);
  await expect(support.create(owner,{...input,category:'payment'},'synthetic_support_request_01'))
   .rejects.toThrow();
  const handler=supportCaseHandlers(db)['support.case_opened']!;
  await handler({caseId:results[0].caseId});
  await handler({caseId:results[0].caseId});
  const work=await db.query('SELECT COUNT(*)::integer AS count FROM support_work_items WHERE case_id=$1',[results[0].caseId]);
  expect(work.rows[0].count).toBe(1);
 });
 it('returns only the signed-in account’s own cases',async()=>{
  const own=await support.list(owner);
  const other=await support.list(stranger);
  expect(own.data).toHaveLength(1);
  expect(other.data).toHaveLength(0);
  expect(own.data[0]?.preferred_contact).toBe('whatsapp');
 });
});
