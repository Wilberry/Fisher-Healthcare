import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AccountProvisioningService } from './account-provisioning.service';
import { BookingVerificationService } from './booking-verification.service';
import { PatientsService } from './patients.service';
import { AddressesService } from './addresses.service';
import { AccessService } from './access.service';
import type { AuthenticatedIdentity } from './identity';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only' && process.env.DATABASE_URL?
 describe:describe.skip;
suite.sequential('phase2 synthetic account and caregiver permission decisions',()=>{
 const self='synthetic-requester-'+randomUUID();
 const reviewer='synthetic-reviewer-'+randomUUID();
 const member='synthetic-unrelated-'+randomUUID();
 const env=process.env.FISHER_PHASE2_BOOKING_MODE;
 let pool:Pool,accounts:AccountProvisioningService,patients:PatientsService,
 access:AccessService,addresses:AddressesService,verification:BookingVerificationService,relId:string,patientId:string;
 const actor=(subject:string,mfa=false):AuthenticatedIdentity=>({
  subject,issuer:'https://synthetic-identity.example.test',authenticationMethods:mfa?['mfa']:[]
 });
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('Disposable DB missing');
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});
  const db=await pool.query('SELECT current_database() AS id');
  if(db.rows[0]?.id!=='fisher_test')throw new Error('Not a dedicated synthetic database');
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  accounts=new AccountProvisioningService();
  patients=new PatientsService();
  addresses=new AddressesService();
  access=new AccessService();
  verification=new BookingVerificationService(access);
  for(const subject of [self,reviewer,member]){
   await accounts.provision(actor(subject));
  }
  const rid=(await pool.query('SELECT id FROM users WHERE identity_subject=$1',[reviewer])).rows[0].id as string;
  await pool.query(`INSERT INTO staff(user_id,role,active) VALUES($1,'administrator',true)`,[rid]);
 });
 afterAll(async()=>{
  await verification?.onModuleDestroy();await access?.onModuleDestroy();
  await addresses?.onModuleDestroy();await patients?.onModuleDestroy();await accounts?.onModuleDestroy();await pool?.end();
  if(env===undefined)delete process.env.FISHER_PHASE2_BOOKING_MODE;
  else process.env.FISHER_PHASE2_BOOKING_MODE=env;
 });
 it('idempotently bootstraps identity subject without granting any patient permission',async()=>{
  const first=await accounts.provision(actor(self));
  const second=await accounts.provision(actor(self));
  expect(first.accountId).toBe(second.accountId);
  expect(first.verifiedContactEmail).toBe(false);
  const user=await pool.query('SELECT COUNT(*)::integer AS count FROM users WHERE identity_subject=$1',[self]);
  expect(user.rows[0].count).toBe(1);
 });
 it('creates a pending profile and denies unverified booking and result permissions',async()=>{
  const profile=await patients.create(self,{displayName:'Synthetic Household Member',relationship:'dependent'});
  patientId=profile.patientId;
  const rows=await pool.query(`SELECT id,can_book,can_view_results,verified_at FROM patient_relationships
   WHERE patient_id=$1`,[patientId]);
  relId=rows.rows[0].id as string;
  expect(rows.rows[0]).toMatchObject({can_book:false,can_view_results:false,verified_at:null});
  await expect(access.requireBookingAccess(self,patientId)).rejects.toThrow();
 });
 it('requires staff MFA and denies unrelated non-staff approvers',async()=>{
  await expect(verification.approve(actor(reviewer),relId,'synthetic-proof-ref-abc123')).rejects.toThrow();
  await expect(verification.approve(actor(member,true),relId,'synthetic-proof-ref-abc123')).rejects.toThrow();
  await expect(access.requireBookingAccess(self,patientId)).rejects.toThrow();
 });
 it('approves booking only, without ever granting result visibility',async()=>{
  const response=await verification.approve(actor(reviewer,true),relId,'synthetic-proof-ref-abc123');
  expect(response).toMatchObject({canBook:true,canViewResults:false});
  await expect(access.requireBookingAccess(self,patientId)).resolves.toBeUndefined();
  const current=await pool.query('SELECT can_book,can_view_results FROM patient_relationships WHERE id=$1',[relId]);
  expect(current.rows[0]).toMatchObject({can_book:true,can_view_results:false});
  await expect(verification.approve(actor(reviewer,true),relId,'synthetic-proof-ref-abc123')).rejects.toThrow();
  const audit=await pool.query(`SELECT metadata FROM audit_events
   WHERE action='patient.booking_verified' AND resource_id=$1`,[relId]);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].metadata.resultAccessGranted).toBe(false);
 });
 it('requires separate coverage review before a created address can be booked',async()=>{
  const zoneId=randomUUID();
  await pool.query(`INSERT INTO service_zones(id,code,name,active,regular_fee_kobo,premium_fee_kobo)
   VALUES($1,$2,'Synthetic address coverage',true,1000,2000)`,[zoneId,'zone-'+zoneId]);
  const request=await addresses.create(self,patientId,{
   zoneId,label:'Synthetic house',addressLine:'Synthetic sample street',locality:'Synthetic area'
  });
  const current=await addresses.list(self,patientId);
  expect(current.data.find(a=>a.id===request.addressId)?.verified).toBe(false);
  await expect(verification.approveAddress(actor(reviewer),request.addressId,'synthetic-coverage-ref-001'))
   .rejects.toThrow();
  const approved=await verification.approveAddress(actor(reviewer,true),request.addressId,'synthetic-coverage-ref-001');
  expect(approved.verified).toBe(true);
  const after=await addresses.list(self,patientId);
  expect(after.data.find(a=>a.id===request.addressId)?.verified).toBe(true);
  await expect(verification.approveAddress(actor(reviewer,true),request.addressId,'synthetic-coverage-ref-001'))
   .rejects.toThrow();
 });
 it('revokes booking authority without revealing unrelated patient data',async()=>{
  await pool.query('UPDATE patient_relationships SET revoked_at=now() WHERE id=$1',[relId]);
  await expect(access.requireBookingAccess(self,patientId)).rejects.toThrow();
  await expect(verification.approve(actor(reviewer,true),relId,'synthetic-proof-ref-abc123')).rejects.toThrow();
 });
});
