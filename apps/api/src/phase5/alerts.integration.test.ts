import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {AccessService} from '../access.service';
import {Phase5AlertsService} from './alerts.service';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&
  process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('Phase 5 synthetic alert lifecycle (disposable PostgreSQL)',()=>{
 const ids={admin:randomUUID(),staff:randomUUID(),outsider:randomUUID(),
   outbox:randomUUID()};
 const subjects={admin:'phase5-admin-'+randomUUID(),
   outsider:'phase5-denied-'+randomUUID()};
 const identity=(subject:string,mfa=true)=>({
   subject,issuer:'https://identity.fisher.test',
   authenticationMethods:mfa?['mfa']:[]
 });
 const previous=process.env.FISHER_PHASE5_OPERATION_MODE;
 let pool:Pool,access:AccessService,service:Phase5AlertsService;
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL||
     process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')
    throw new Error('Disposable verification environment required');
  process.env.FISHER_PHASE5_OPERATION_MODE='synthetic-only';
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
  const result=await pool.query<{db:string}>('SELECT current_database() AS db');
  if(result.rows[0]?.db!=='fisher_test')throw new Error('Refusing non-disposable database');
  const table=await pool.query<{present:string|null}>(`
    SELECT to_regclass('public.phase5_operational_alerts')::text present`);
  if(!table.rows[0]?.present)throw new Error('Missing Phase 5 migration 0035');
  await pool.query('INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4)',
    [ids.admin,subjects.admin,ids.outsider,subjects.outsider]);
  await pool.query(`
    INSERT INTO staff(id,user_id,role,active)
    VALUES($1,$2,'administrator',true)`,[ids.staff,ids.admin]);
  await pool.query(`
    INSERT INTO outbox(id,event_type,payload,dead_lettered_at)
    VALUES($1,'phase5.synthetic_alert_test',$2::jsonb,now())`,
    [ids.outbox,JSON.stringify({syntheticOnly:true})]);
  access=new AccessService();service=new Phase5AlertsService(access);
 });
 afterAll(async()=>{
  if(previous===undefined)delete process.env.FISHER_PHASE5_OPERATION_MODE;
  else process.env.FISHER_PHASE5_OPERATION_MODE=previous;
  await service?.onModuleDestroy();await access?.onModuleDestroy();
  if(pool){
   await pool.query('DELETE FROM outbox WHERE id=$1',[ids.outbox]);
   await pool.end();
  }
 });
 it('fails closed without MFA or current staff authorization',async()=>{
  await expect(service.evaluate(identity(subjects.admin,false))).rejects.toThrow();
  await expect(service.list(identity(subjects.outsider))).rejects.toThrow();
  await expect(service.acknowledge(identity(subjects.outsider),'outbox_dead_letters'))
   .rejects.toThrow();
 });
 it('evaluates only aggregate signals and permits acknowledgment with idempotent replay',async()=>{
  const evaluated=await service.evaluate(identity(subjects.admin));
  expect(evaluated.data.counts.outbox_dead_letters).toBeGreaterThanOrEqual(1);
  expect(evaluated.data.pilotActivationAuthorized).toBe(false);
  expect(evaluated.data.externalPagingEnabled).toBe(false);
  const list=await service.list(identity(subjects.admin));
  const rows=list.data as {code:string;status:string;observed_count:number}[];
  expect(rows.some(row=>row.code==='outbox_dead_letters'&&row.observed_count>=1))
   .toBe(true);
  const first=await service.acknowledge(identity(subjects.admin),'outbox_dead_letters');
  expect(first.data).toEqual({code:'outbox_dead_letters',status:'acknowledged',replayed:false});
  const retry=await service.acknowledge(identity(subjects.admin),'outbox_dead_letters');
  expect(retry.data.replayed).toBe(true);
  await service.evaluate(identity(subjects.admin));
  const current=await service.list(identity(subjects.admin));
  const record=(current.data as {code:string;status:string}[])
    .find(row=>row.code==='outbox_dead_letters');
  expect(record?.status).toBe('acknowledged');
  const serialized=JSON.stringify(current);
  expect(serialized).not.toContain(subjects.admin);
  expect(serialized).not.toContain(ids.outbox);
 });
 it('denies invalid alert codes and direct deletion',async()=>{
  await expect(service.acknowledge(identity(subjects.admin),'patient_123'))
   .rejects.toThrow();
  await expect(pool.query(`
    DELETE FROM phase5_operational_alerts WHERE code='outbox_dead_letters'`))
   .rejects.toThrow();
  await expect(pool.query(`
    UPDATE phase5_operational_alerts SET acknowledged_by=$1
    WHERE code='outbox_dead_letters'`,[ids.outsider])).rejects.toThrow();
 });
});
