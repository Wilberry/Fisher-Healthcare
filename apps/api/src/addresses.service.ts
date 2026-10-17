import { BadRequestException, ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { createAddressInput, type CreateAddressInput } from '@fisher/contracts';

@Injectable()
export class AddressesService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});}
 async onModuleDestroy(){await this.pool?.end();}
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Address service unavailable');return this.pool;}
 parse(input:unknown):CreateAddressInput{
  const v=createAddressInput.safeParse(input);
  if(!v.success)throw new BadRequestException('Invalid collection address request');
  return v.data;
 }
 async list(subject:string,patientId:string){
  const result=await this.db.query(`SELECT a.id,a.zone_id,a.label,a.address_line,a.locality,
    a.verified_at IS NOT NULL AND a.revoked_at IS NULL AS verified
   FROM patient_addresses a JOIN users u ON u.id=a.owner_user_id
   JOIN patient_relationships r ON r.user_id=u.id AND r.patient_id=a.patient_id
   WHERE a.patient_id=$1 AND u.identity_subject=$2 AND r.can_book
     AND r.verified_at IS NOT NULL AND r.revoked_at IS NULL AND a.revoked_at IS NULL
   ORDER BY a.created_at DESC LIMIT 50`,[patientId,subject]);
  return {data:result.rows};
 }
 async create(subject:string,patientId:string,input:CreateAddressInput){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic'||process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Collection addresses not activated');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const owner=await c.query<{id:string}>(`SELECT u.id FROM users u
      JOIN patient_relationships r ON r.user_id=u.id
      WHERE u.identity_subject=$1 AND r.patient_id=$2
        AND r.can_book AND r.verified_at IS NOT NULL AND r.revoked_at IS NULL
      FOR SHARE OF r`,[subject,patientId]);
    if(!owner.rows[0])throw new ForbiddenException('Patient booking authority required');
    const zone=await c.query('SELECT id FROM service_zones WHERE id=$1 AND active=true',[input.zoneId]);
    if(!zone.rows.length)throw new BadRequestException('Collection zone unavailable');
    const created=await c.query<{id:string}>(`INSERT INTO patient_addresses(
      patient_id,owner_user_id,zone_id,label,address_line,locality)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [patientId,owner.rows[0].id,input.zoneId,input.label,input.addressLine,input.locality]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
       VALUES($1,'patient.address_requested','patient_address',$2)`,
       [owner.rows[0].id,created.rows[0]!.id]);
    await c.query('COMMIT');
    return {addressId:created.rows[0]!.id,verified:false,status:'coverage_review_required'};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
