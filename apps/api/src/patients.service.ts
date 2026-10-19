import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { createPatientSchema, type CreatePatient } from '@fisher/contracts';

@Injectable()
export class PatientsService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});}
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Patients unavailable');return this.pool;}
 parse(value:unknown):CreatePatient {
  const parsed=createPatientSchema.safeParse(value);
  if(!parsed.success)throw new BadRequestException('Invalid patient profile');
  if(parsed.data.dateOfBirth){
   const dob=new Date(parsed.data.dateOfBirth+'T00:00:00Z');
   if(!Number.isFinite(dob.getTime()) || dob.toISOString().slice(0,10)!==parsed.data.dateOfBirth ||
      dob>new Date())throw new BadRequestException('Invalid date of birth');
  }
  return parsed.data;
 }
 async create(subject:string,input:CreatePatient){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Patient onboarding is not activated');
  const c=await this.db.connect();
  try {
   await c.query('BEGIN');
   try {
    const u=await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[subject]);
    if(!u.rows[0])throw new ForbiddenException('Account not provisioned');
    const p=await c.query<{id:string}>(
     'INSERT INTO patients(display_name,date_of_birth) VALUES($1,$2) RETURNING id',
     [input.displayName,input.dateOfBirth??null]);
    const id=p.rows[0]!.id;
    await c.query(`INSERT INTO patient_relationships(user_id,patient_id,relationship,
       can_book,can_view_results,verified_at) VALUES($1,$2,$3,false,false,NULL)`,
       [u.rows[0].id,id,input.relationship]);
    await c.query('COMMIT');
    // Self-declared family relationships never confer booking or result access.
    return {patientId:id,relationshipStatus:'verification_required',canBook:false,canViewResults:false};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
 async list(subject:string){
  const r=await this.db.query(`SELECT p.id,p.display_name,rel.relationship,
    rel.can_book,rel.can_view_results,rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL AS verified
    FROM patient_relationships rel JOIN patients p ON p.id=rel.patient_id
    JOIN users u ON u.id=rel.user_id WHERE u.identity_subject=$1
      AND rel.revoked_at IS NULL ORDER BY p.created_at DESC LIMIT 50`,[subject]);
  return {data:r.rows};
 }
 async get(subject:string,patientId:string){
  const r=await this.db.query(`SELECT p.id,p.display_name,rel.relationship,
    rel.can_book,rel.can_view_results,
    rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL AS verified
    FROM patients p JOIN patient_relationships rel ON rel.patient_id=p.id
    JOIN users u ON u.id=rel.user_id
    WHERE p.id=$1 AND u.identity_subject=$2 AND rel.revoked_at IS NULL`,[patientId,subject]);
  if(!r.rows[0])throw new NotFoundException('Patient profile not found');
  return {data:r.rows[0]};
 }
 async revoke(subject:string,patientId:string){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic'||process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Relationship revocation not activated');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const row=await c.query<{id:string;user_id:string;revoked_at:Date|null}>(`SELECT r.id,r.user_id,r.revoked_at
     FROM patient_relationships r JOIN users u ON u.id=r.user_id
     WHERE u.identity_subject=$1 AND r.patient_id=$2 FOR UPDATE OF r`,[subject,patientId]);
    const entry=row.rows[0];
    if(!entry)throw new NotFoundException('Patient relationship not found');
    if(entry.revoked_at){await c.query('COMMIT');return {patientId,status:'revoked'};}
    await c.query(`UPDATE patient_relationships SET can_book=false,can_view_results=false,
     revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[entry.id]);
    await c.query(`UPDATE patient_addresses SET revoked_at=clock_timestamp(),
     updated_at=clock_timestamp() WHERE owner_user_id=$1 AND patient_id=$2
      AND revoked_at IS NULL`,[entry.user_id,patientId]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
     VALUES($1,'patient.relationship_revoked','patient_relationship',$2)`,[entry.user_id,entry.id]);
    await c.query('COMMIT');
    return {patientId,status:'revoked'};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
