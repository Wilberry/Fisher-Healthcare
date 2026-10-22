import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {claimResultEmail} from './result-delivery';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&
  process.env.DATABASE_URL?describe:describe.skip;

suite.sequential('Phase 4 email opt-in and revocation (disposable PostgreSQL)',()=>{
 const ids={user:randomUUID(),patient:randomUUID(),lab:randomUUID(),
   order:randomUUID(),result:randomUUID()};
 const email='synthetic-result-'+randomUUID().slice(0,8)+'@example.test';
 let pool:Pool;
 beforeAll(async()=>{
  if(process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only'||!process.env.DATABASE_URL)
    throw new Error('Disposable PostgreSQL required');
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  const db=await pool.query<{name:string}>('SELECT current_database() AS name');
  if(db.rows[0]?.name!=='fisher_test')throw new Error('Refusing non-disposable DB');
  await pool.query('INSERT INTO users(id,identity_subject,email) VALUES($1,$2,$3)',
    [ids.user,'synthetic-result-recipient-'+randomUUID(),email]);
  await pool.query("INSERT INTO patients(id,display_name) VALUES($1,'Synthetic Results Recipient')",
    [ids.patient]);
  await pool.query(`INSERT INTO patient_relationships
    (user_id,patient_id,relationship,can_view_results,verified_at)
    VALUES($1,$2,'self',true,now())`,[ids.user,ids.patient]);
  await pool.query("INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic Mail Lab',true)",
    [ids.lab]);
  await pool.query(`INSERT INTO orders
    (id,patient_id,booked_by,lab_id,status,tier,total_kobo)
    VALUES($1,$2,$3,$4,'completed','regular',0)`,
    [ids.order,ids.patient,ids.user,ids.lab]);
  await pool.query(`INSERT INTO results
    (id,order_id,patient_id,object_key,released_at,released_by)
    VALUES($1,$2,$3,'synthetic/results/test.pdf',now(),$4)`,
    [ids.result,ids.order,ids.patient,ids.user]);
  await pool.query(`
    INSERT INTO phase4_result_release_events(result_id,release_key,released_by)
    VALUES($1,$2,$3)`,[ids.result,randomUUID(),ids.user]);
  await pool.query(`INSERT INTO phase4_result_delivery_intents(result_id,channel)
    VALUES($1,'email')`,[ids.result]);
 });
 afterAll(async()=>{await pool?.end();});
 it('refuses result email until the patient explicitly enables it',async()=>{
  expect(await claimResultEmail(pool,[email])).toBeNull();
  const row=await pool.query(`
    SELECT status,attempts FROM phase4_result_delivery_intents
    WHERE result_id=$1`,[ids.result]);
  expect(row.rows).toEqual([{status:'pending',attempts:0}]);
 });
 it('claims a message only for the allowed, opted-in self relationship',async()=>{
  await pool.query(`INSERT INTO phase4_result_email_preferences
    (user_id,patient_id,enabled) VALUES($1,$2,true)`,[ids.user,ids.patient]);
  expect(await claimResultEmail(pool,['not-allowed@example.test'])).toBeNull();
  const claim=await claimResultEmail(pool,[email]);
  expect(claim?.result_id).toBe(ids.result);
  expect(claim?.recipient).toBe(email);
  expect(claim?.lease_token).toBeTruthy();
 });
 it('prevents subsequent claims after opt-out or revoked viewing authority',async()=>{
  await pool.query(`UPDATE phase4_result_email_preferences
    SET enabled=false WHERE user_id=$1 AND patient_id=$2`,[ids.user,ids.patient]);
  await pool.query(`UPDATE phase4_result_delivery_intents
    SET status='pending',lease_token=NULL,lease_expires_at=NULL
    WHERE result_id=$1`,[ids.result]);
  expect(await claimResultEmail(pool,[email])).toBeNull();
  await pool.query(`UPDATE phase4_result_email_preferences
    SET enabled=true WHERE user_id=$1 AND patient_id=$2`,[ids.user,ids.patient]);
  await pool.query(`UPDATE patient_relationships SET revoked_at=now(),can_view_results=false
    WHERE user_id=$1 AND patient_id=$2`,[ids.user,ids.patient]);
  expect(await claimResultEmail(pool,[email])).toBeNull();
 });
});
