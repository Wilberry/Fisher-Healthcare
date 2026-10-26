import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {AccessService} from '../access.service';
import {Phase5PostureService} from './posture.service';
const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&
  process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('Phase 5 synthetic operational readiness',()=>{
 const subjects={admin:'synthetic-posture-admin-'+randomUUID(),
  denied:'synthetic-posture-denied-'+randomUUID()};
 const ids={admin:randomUUID(),staff:randomUUID(),denied:randomUUID()};
 const identity=(subject:string,mfa:boolean)=>({
  subject,issuer:'https://identity.fisher.test',
  authenticationMethods:mfa?['mfa']:[]
 });
 const prior=process.env.FISHER_PHASE5_OPERATION_MODE;
 let pool:Pool,access:AccessService,service:Phase5PostureService;
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('No database');
  process.env.FISHER_PHASE5_OPERATION_MODE='synthetic-only';
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
  const db=await pool.query<{name:string}>('SELECT current_database() name');
  if(db.rows[0]?.name!=='fisher_test')throw new Error('Disposable DB required');
  await pool.query(`
   INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4)`,
   [ids.admin,subjects.admin,ids.denied,subjects.denied]);
  await pool.query(`
   INSERT INTO staff(id,user_id,role,active)
   VALUES($1,$2,'administrator',true)`,[ids.staff,ids.admin]);
  access=new AccessService();
  service=new Phase5PostureService(access);
 });
 afterAll(async()=>{
  if(prior===undefined)delete process.env.FISHER_PHASE5_OPERATION_MODE;
  else process.env.FISHER_PHASE5_OPERATION_MODE=prior;
  await service?.onModuleDestroy();await access?.onModuleDestroy();await pool?.end();
 });
 it('requires MFA and current administrator authorization',async()=>{
  await expect(service.snapshot(identity(subjects.admin,false))).rejects.toThrow();
  await expect(service.snapshot(identity(subjects.denied,true))).rejects.toThrow();
 });
 it('revokes readiness access immediately when staff is deactivated',async()=>{
  await pool.query('UPDATE staff SET active=false WHERE id=$1',[ids.staff]);
  try{
   await expect(service.snapshot(identity(subjects.admin,true))).rejects.toThrow();
  }finally{
   await pool.query('UPDATE staff SET active=true WHERE id=$1',[ids.staff]);
  }
 });
 it('returns aggregates without patients, identities, specimen or clinical data',async()=>{
  const result=await service.snapshot(identity(subjects.admin,true));
  expect(result.data.pilotActivationAuthorized).toBe(false);
  expect(result.data.productionReleaseAuthorized).toBe(false);
  const serialized=JSON.stringify(result);
  expect(serialized).not.toContain(subjects.admin);
  expect(serialized).not.toContain(ids.admin);
  expect(serialized).not.toContain('patient_id');
  expect(result.data.counts.outboxPending).toBeGreaterThanOrEqual(0);
 });
});
