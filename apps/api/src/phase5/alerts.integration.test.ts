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
  await pool.query('UPDATE staff SET active=false WHERE id=$1',[ids.staff]);
  await expect(service.evaluate(identity(subjects.admin))).rejects.toThrow();
  await expect(service.list(identity(subjects.admin))).rejects.toThrow();
  await expect(service.acknowledge(identity(subjects.admin),'outbox_dead_letters'))
   .rejects.toThrow();
  await pool.query('UPDATE staff SET active=true WHERE id=$1',[ids.staff]);
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
  const stateEvents=await pool.query<{
    event_type:string;observed_count:number;actor_id:string
   }>(`
    SELECT event_type,observed_count,actor_id
    FROM phase5_alert_state_events
    WHERE code='outbox_dead_letters' ORDER BY recorded_at,id`);
  expect(stateEvents.rows.some(event=>event.event_type==='opened'&&
    event.observed_count>=1)).toBe(true);
  expect(stateEvents.rows.some(event=>event.event_type==='acknowledged'&&
    event.actor_id===ids.admin)).toBe(true);
  expect(current.history.length).toBeLessThanOrEqual(30);
  expect(current.history.some((event:{event_type:string})=>
    event.event_type==='acknowledged')).toBe(true);
  for(const entry of current.history as Record<string,unknown>[]){
   expect(Object.keys(entry).sort()).toEqual(
    ['code','event_type','observed_count','recorded_at'].sort());
  }
  const serialized=JSON.stringify(current);
  expect(serialized).not.toContain(subjects.admin);
  expect(serialized).not.toContain(ids.outbox);
  expect(serialized).not.toContain(ids.admin);
 });
 it('enforces legal state transitions and clears old acknowledgment on reopen',async()=>{
  await expect(pool.query(`
    UPDATE phase5_operational_alerts
    SET status='resolved',observed_count=0,resolved_at=now(),
        acknowledged_by=$1
    WHERE code='outbox_dead_letters'`,[ids.outsider])).rejects.toThrow();
  await pool.query(`
    UPDATE phase5_operational_alerts
    SET status='resolved',observed_count=0,resolved_at=now()
    WHERE code='outbox_dead_letters'`);
  await expect(pool.query(`
    UPDATE phase5_operational_alerts
    SET status='acknowledged',observed_count=1
    WHERE code='outbox_dead_letters'`)).rejects.toThrow();
  await pool.query(`
    UPDATE phase5_operational_alerts
    SET status='open',observed_count=1,
      acknowledged_by=NULL,acknowledged_at=NULL,resolved_at=NULL
    WHERE code='outbox_dead_letters'`);
  const current=await pool.query<{
    status:string;acknowledged_by:string|null;resolved_at:Date|null
  }>(`SELECT status,acknowledged_by,resolved_at
     FROM phase5_operational_alerts WHERE code='outbox_dead_letters'`);
  expect(current.rows[0]).toEqual({
    status:'open',acknowledged_by:null,resolved_at:null
  });
 });
 it('rejects event counts contradictory to their transition types',async()=>{
  await expect(pool.query(`
   INSERT INTO phase5_alert_state_events(code,event_type,observed_count,actor_id)
   VALUES('outbox_dead_letters','resolved',1,$1)`,[ids.admin])).rejects.toThrow();
  await expect(pool.query(`
   INSERT INTO phase5_alert_state_events(code,event_type,observed_count,actor_id)
   VALUES('outbox_dead_letters','opened',0,$1)`,[ids.admin])).rejects.toThrow();
 });
 it('refuses production activation and missing disposable acknowledgement',async()=>{
  const oldNode=process.env.NODE_ENV;
  const oldAck=process.env.FISHER_DISPOSABLE_DB_ACK;
  try{
   process.env.NODE_ENV='production';
   await expect(service.list(identity(subjects.admin))).rejects.toThrow();
   await expect(service.evaluate(identity(subjects.admin))).rejects.toThrow();
   process.env.NODE_ENV='test';
   delete process.env.FISHER_DISPOSABLE_DB_ACK;
   await expect(service.acknowledge(identity(subjects.admin),'outbox_dead_letters'))
    .rejects.toThrow();
  }finally{
   if(oldNode===undefined)delete process.env.NODE_ENV;
   else process.env.NODE_ENV=oldNode;
   if(oldAck===undefined)delete process.env.FISHER_DISPOSABLE_DB_ACK;
   else process.env.FISHER_DISPOSABLE_DB_ACK=oldAck;
  }
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
  await expect(pool.query(`
    DELETE FROM phase5_alert_state_events WHERE code='outbox_dead_letters'`))
   .rejects.toThrow();
 });
});
