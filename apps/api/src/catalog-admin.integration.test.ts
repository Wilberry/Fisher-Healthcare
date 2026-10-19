import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { CatalogAdminService } from './catalog-admin.service';
import { BookingService } from './booking.service';
import { AccessService } from './access.service';
import { slotInput, testInput, zoneInput, offeringInput } from './catalog-admin.dto';
import type { AuthenticatedIdentity } from './identity';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only' &&
 process.env.DATABASE_URL ? describe:describe.skip;

suite.sequential('phase2 synthetic two-person catalogue review',()=>{
 let db:Pool,access:AccessService,catalog:CatalogAdminService,booking:BookingService;
 const env=process.env.FISHER_PHASE2_BOOKING_MODE;
 const createSubject='synthetic-catalog-author-'+randomUUID();
 const approveSubject='synthetic-catalog-approver-'+randomUUID();
 const viewerSubject='synthetic-catalog-viewer-'+randomUUID();
 const creator:AuthenticatedIdentity={subject:createSubject,issuer:'https://example.invalid',authenticationMethods:['mfa']};
 const reviewer:AuthenticatedIdentity={subject:approveSubject,issuer:'https://example.invalid',authenticationMethods:['mfa']};
 const withoutMfa:AuthenticatedIdentity={...reviewer,authenticationMethods:[]};
 const testCode='T'+randomUUID().replaceAll('-','').slice(0,17).toUpperCase();
 const zoneCode='Z'+randomUUID().replaceAll('-','').slice(0,17).toUpperCase();
 let testId='',labId='',zoneId='',offeringId='',slotId='';
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('Database required');
  db=new Pool({connectionString:process.env.DATABASE_URL,max:4});
  const database=await db.query('SELECT current_database() AS name');
  if(database.rows[0]?.name!=='fisher_test')throw new Error('Refusing non-synthetic database');
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  access=new AccessService();
  catalog=new CatalogAdminService(access);
  booking=new BookingService();
  for(const [subject,role] of [[createSubject,'administrator'],[approveSubject,'administrator'],[viewerSubject,'support']]){
   const result=await db.query<{id:string}>('INSERT INTO users(identity_subject) VALUES($1) RETURNING id',[subject]);
   await db.query('INSERT INTO staff(user_id,role,active) VALUES($1,$2,true)',[result.rows[0]!.id,role]);
  }
 });
 afterAll(async()=>{
  await booking?.onModuleDestroy();
  await catalog?.onModuleDestroy();
  await access?.onModuleDestroy();
  await db?.end();
  if(env===undefined)delete process.env.FISHER_PHASE2_BOOKING_MODE;
  else process.env.FISHER_PHASE2_BOOKING_MODE=env;
 });
 it('denies unsafe catalog payloads and unauthenticated capabilities',async()=>{
  expect(testInput.safeParse({code:'x',name:'Synthetic screening',specimenType:'blood',preparationText:'Approved instructions'}).success).toBe(false);
  expect(zoneInput.safeParse({code:zoneCode,name:'Synthetic zone',regularFeeKobo:-1,premiumFeeKobo:200}).success).toBe(false);
  expect(offeringInput.safeParse({labId:randomUUID(),testId:randomUUID(),priceKobo:1.5,turnaroundHours:24}).success).toBe(false);
  await expect(catalog.test({...creator,authenticationMethods:[]},{
   code:testCode,name:'Synthetic screening',specimenType:'blood',
   preparationText:'Synthetic approved collection instructions'
  })).rejects.toThrow();
  await expect(catalog.reviews({subject:viewerSubject,issuer:creator.issuer,authenticationMethods:['mfa']})).rejects.toThrow();
 });
 it('creates inactive offerings pending a separate reviewer',async()=>{
  const test=await catalog.test(creator,{
   code:testCode,name:'Synthetic diagnostic',specimenType:'blood',
   preparationText:'Synthetic clinically approved preparation text for testing only.'
  });
  const lab=await catalog.laboratory(creator,{name:'Synthetic verified laboratory'});
  const zone=await catalog.zone(creator,{
   code:zoneCode,name:'Synthetic coverage zone',regularFeeKobo:3000,premiumFeeKobo:9000
  });
  testId=test.resourceId;labId=lab.resourceId;zoneId=zone.resourceId;
  const row=await db.query('SELECT active FROM tests WHERE id=$1',[testId]);
  expect(row.rows[0].active).toBe(false);
  const publicCatalogue=await booking.catalogue();
  expect(publicCatalogue.data.some(v=>v.id===testId)).toBe(false);
  await expect(catalog.approve(creator,'test',testId,'synthetic-review-evidence-1')).rejects.toThrow();
  await expect(catalog.approve(withoutMfa,'test',testId,'synthetic-review-evidence-1')).rejects.toThrow();
  for(const [type,id] of [['test',testId],['laboratory',labId],['zone',zoneId]] as const){
   const approval=await catalog.approve(reviewer,type,id,'synthetic-review-evidence-1');
   expect(approval.active).toBe(true);
   await expect(catalog.approve(reviewer,type,id,'synthetic-review-evidence-1')).rejects.toThrow();
  }
 });
 it('does not publish an offering until its test and laboratory are approved',async()=>{
  const offering=await catalog.offering(creator,{labId,testId,priceKobo:18000,turnaroundHours:24});
  offeringId=offering.resourceId;
  const hidden=await booking.catalogue();
  expect(hidden.data.some(v=>v.id===testId)).toBe(false);
  const approved=await catalog.approve(reviewer,'offering',offeringId,'synthetic-review-evidence-2');
  expect(approved.active).toBe(true);
  const visible=await booking.catalogue();
  expect(visible.data.some(v=>v.id===testId)).toBe(true);
  const details=await booking.testDetails(testId);
  expect(details.data.preparation_text).toContain('Synthetic clinically approved');
 });
 it('makes slot capacity public only after two-actor review',async()=>{
  const now=Date.now();
  const startsAt=new Date(now+86400000).toISOString();
  const endsAt=new Date(now+90000000).toISOString();
  const cutoffAt=new Date(now+43200000).toISOString();
  const dto={zoneId,labId,tier:'regular' as const,startsAt,endsAt,cutoffAt,capacity:2};
  expect(slotInput.safeParse(dto).success).toBe(true);
  const slot=await catalog.slot(creator,dto);slotId=slot.resourceId;
  let available=await booking.availability(zoneId,labId,'regular');
  expect(available.data.some(v=>v.id===slotId)).toBe(false);
  await catalog.approve(reviewer,'slot',slotId,'synthetic-review-evidence-3');
  available=await booking.availability(zoneId,labId,'regular');
  expect(available.data.find(v=>v.id===slotId)?.remaining).toBe(2);
  const quoted=await booking.quote({zoneId,slotId,labId,serviceTier:'regular',testIds:[testId]});
  expect(quoted.totalKobo).toBe(21000);
  const audit=await db.query("SELECT action FROM audit_events WHERE resource_id=$1 AND action='catalog.approved'",[slotId]);
  expect(audit.rowCount).toBe(1);
 });
});
