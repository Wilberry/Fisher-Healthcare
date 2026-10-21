import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {AccessService} from '../access.service';
import {Phase4PhysicalCopyService} from './physical-copy.service';

const suite=process.env.DATABASE_URL&&
  process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'?describe:describe.skip;
suite.sequential('Phase 4 physical copy quote workflow (disposable PostgreSQL)',()=>{
 const prev=process.env.FISHER_PHASE4_OPERATION_MODE;
 const ids={
  owner:randomUUID(),other:randomUUID(),finance:randomUUID(),financeStaff:randomUUID(),
  patient:randomUUID(),zone:randomUUID(),lab:randomUUID(),order:randomUUID(),
  result:randomUUID(),address:randomUUID(),secondAddress:randomUUID(),
  requestKey:randomUUID(),secondKey:randomUUID(),releaseKey:randomUUID()
 };
 const ownerSubject='synthetic-copy-owner-'+randomUUID();
 const otherSubject='synthetic-copy-outsider-'+randomUUID();
 const financeSubject='synthetic-copy-finance-'+randomUUID();
 const identity=(subject:string,mfa=false)=>({
   subject,issuer:'https://identity.fisher.test',
   authenticationMethods:mfa?['mfa']:[]
 });
 let pool:Pool,access:AccessService,physical:Phase4PhysicalCopyService;
 let requestId:string;
 beforeAll(async()=>{
   if(process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only'||!process.env.DATABASE_URL)
     throw new Error('Disposable test environment required');
   process.env.FISHER_PHASE4_OPERATION_MODE='synthetic-only';
   pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
   const database=await pool.query<{name:string}>('SELECT current_database() AS name');
   if(database.rows[0]?.name!=='fisher_test')
     throw new Error('Refusing non-disposable database');
   const installed=await pool.query<{present:string|null}>(`
     SELECT to_regclass('public.phase4_physical_copy_requests')::text AS present`);
   if(!installed.rows[0]?.present)throw new Error('Missing physical-copy migration');
   await pool.query(`INSERT INTO users(id,identity_subject)
     VALUES($1,$2),($3,$4),($5,$6)`,[
       ids.owner,ownerSubject,ids.other,otherSubject,ids.finance,financeSubject]);
   await pool.query(`
     INSERT INTO staff(id,user_id,role,active)
     VALUES($1,$2,'finance',true)`,[ids.financeStaff,ids.finance]);
   await pool.query(`
     INSERT INTO patients(id,display_name)
     VALUES($1,'Synthetic Patient for Copy Delivery')`,[ids.patient]);
   await pool.query(`
     INSERT INTO patient_relationships
       (user_id,patient_id,relationship,can_book,can_view_results,verified_at)
     VALUES($1,$2,'self',true,true,now())`,[ids.owner,ids.patient]);
   await pool.query(`
     INSERT INTO service_zones(id,code,name,active,regular_fee_kobo,premium_fee_kobo)
     VALUES($1,$2,'Synthetic Copy Service Zone',true,0,0)`,
     [ids.zone,'SYN-COPY-'+ids.zone.slice(0,8)]);
   await pool.query(`
     INSERT INTO laboratories(id,name,active)
     VALUES($1,'Synthetic Copy Laboratory',true)`,[ids.lab]);
   await pool.query(`
     INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo)
     VALUES($1,$2,$3,$4,'results_ready','regular',0)`,
     [ids.order,ids.patient,ids.owner,ids.lab]);
   await pool.query(`
     INSERT INTO results(id,order_id,patient_id,object_key,released_at,released_by)
     VALUES($1,$2,$3,$4,now(),$5)`,
     [ids.result,ids.order,ids.patient,'synthetic/results/copy-not-delivered.pdf',ids.finance]);
   await pool.query(`
     INSERT INTO phase4_result_release_events(result_id,release_key,released_by)
     VALUES($1,$2,$3)`,[ids.result,ids.releaseKey,ids.finance]);
   for(const addr of [ids.address,ids.secondAddress]){
     await pool.query(`
       INSERT INTO patient_addresses(id,patient_id,owner_user_id,zone_id,
         label,address_line,locality,verified_at)
       VALUES($1,$2,$3,$4,'Synthetic home','Test Street 1','Test Lagos',now())`,
       [addr,ids.patient,ids.owner,ids.zone]);
   }
   access=new AccessService();physical=new Phase4PhysicalCopyService(access);
 });
 afterAll(async()=>{
   if(prev===undefined)delete process.env.FISHER_PHASE4_OPERATION_MODE;
   else process.env.FISHER_PHASE4_OPERATION_MODE=prev;
   await physical?.onModuleDestroy();await access?.onModuleDestroy();await pool?.end();
 });
 it('never allows outsiders to request or view patient physical-copy status',async()=>{
   await expect(physical.request(identity(otherSubject),ids.patient,{
      resultId:ids.result,addressId:ids.address,requestKey:randomUUID()
   })).rejects.toThrow();
   await expect(physical.patientRequests(identity(otherSubject),ids.patient)).rejects.toThrow();
 });
 it('creates a request but cannot charge or dispatch; retries are idempotent',async()=>{
   const input={resultId:ids.result,addressId:ids.address,requestKey:ids.requestKey};
   const first=await physical.request(identity(ownerSubject),ids.patient,input);
   requestId=first.data.id;
   expect(first.data).toMatchObject({status:'requested',replayed:false,
     paymentCollectionEnabled:false,deliveryEnabled:false});
   expect((await physical.request(identity(ownerSubject),ids.patient,input))
     .data.replayed).toBe(true);
   await expect(physical.request(identity(ownerSubject),ids.patient,{
     ...input,addressId:ids.secondAddress
   })).rejects.toThrow();
   expect((await physical.patientRequests(identity(ownerSubject),ids.patient))
     .data.some((v:{id:string})=>v.id===requestId)).toBe(true);
 });
 it('quotes only for independently authenticated finance staff and a still-approved address',async()=>{
   await expect(physical.quote(identity(ownerSubject),requestId,5000)).rejects.toThrow();
   await expect(physical.quote(identity(financeSubject,false),requestId,5000)).rejects.toThrow();
   await pool.query('UPDATE patient_addresses SET revoked_at=now() WHERE id=$1',
      [ids.address]);
   await expect(physical.quote(identity(financeSubject,true),requestId,5000)).rejects.toThrow();
   await pool.query('UPDATE patient_addresses SET revoked_at=NULL WHERE id=$1',
      [ids.address]);
   const quoted=await physical.quote(identity(financeSubject,true),requestId,5000);
   expect(quoted.data).toMatchObject({status:'quoted',
     paymentCollectionEnabled:false,deliveryEnabled:false});
   expect((await physical.quote(identity(financeSubject,true),requestId,5000))
     .data.replayed).toBe(true);
   await expect(physical.quote(identity(financeSubject,true),requestId,6000))
     .rejects.toThrow();
   await expect(pool.query(`
      UPDATE phase4_physical_copy_requests SET quote_kobo=6000 WHERE id=$1`,
      [requestId])).rejects.toThrow();
 });
 it('lets a patient cancel an unquoted request but not rewrite a quote',async()=>{
   await expect(physical.cancel(identity(ownerSubject),ids.patient,requestId))
     .rejects.toThrow();
   const unquoted=await physical.request(identity(ownerSubject),ids.patient,{
      resultId:ids.result,addressId:ids.secondAddress,requestKey:ids.secondKey});
   const id=unquoted.data.id;
   expect((await physical.cancel(identity(ownerSubject),ids.patient,id))
     .data.status).toBe('cancelled');
   expect((await physical.cancel(identity(ownerSubject),ids.patient,id))
     .data.replayed).toBe(true);
   await expect(physical.quote(identity(financeSubject,true),id,2000)).rejects.toThrow();
   expect((await physical.queue(identity(financeSubject,true))).data
     .some((x:{id:string})=>x.id===requestId)).toBe(true);
 });
});
