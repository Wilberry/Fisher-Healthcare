import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AccessService } from './access.service';
import { requireStaffMfa, type AuthenticatedIdentity } from './identity';
import {
 type CatalogType,type TestInput,type LabInput,type ZoneInput,type OfferingInput,type SlotInput
} from './catalog-admin.dto';

@Injectable()
export class CatalogAdminService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private enabled(){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Catalogue management not enabled');
 }
 private get db(){if(!this.pool)throw new ServiceUnavailableException('Catalogue database unavailable');return this.pool;}
 private async authorize(identity:AuthenticatedIdentity,capability:'labs:manage'|'orders:manage'){
  this.enabled();requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,capability);
 }
 private async actor(c:PoolClient,identity:AuthenticatedIdentity){
  const r=await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[identity.subject]);
  if(!r.rows[0])throw new ForbiddenException('Reviewer account is not provisioned');
  return r.rows[0].id;
 }
 private async create(id:AuthenticatedIdentity,type:CatalogType,capability:'labs:manage'|'orders:manage',
  insert:(c:PoolClient)=>Promise<string>){
  await this.authorize(id,capability);
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const actor=await this.actor(c,id);
    const resource=await insert(c);
    await c.query(`INSERT INTO catalog_review_requests(resource_type,resource_id,creator_id)
      VALUES($1,$2,$3)`,[type,resource,actor]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
      VALUES($1,'catalog.review_requested',$2,$3)`,[actor,type,resource]);
    await c.query('COMMIT');
    return {resourceId:resource,resourceType:type,status:'pending_review',active:false};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
 async test(id:AuthenticatedIdentity,data:TestInput){
  return this.create(id,'test','labs:manage',async c=>{
   const r=await c.query<{id:string}>(`INSERT INTO tests(code,name,specimen_type,preparation_text,active)
    VALUES($1,$2,$3,$4,false) RETURNING id`,
    [data.code,data.name,data.specimenType,data.preparationText]);
   return r.rows[0]!.id;
  });
 }
 async laboratory(id:AuthenticatedIdentity,data:LabInput){
  return this.create(id,'laboratory','labs:manage',async c=>{
   const r=await c.query<{id:string}>('INSERT INTO laboratories(name,active) VALUES($1,false) RETURNING id',
    [data.name]);
   return r.rows[0]!.id;
  });
 }
 async zone(id:AuthenticatedIdentity,data:ZoneInput){
  return this.create(id,'zone','orders:manage',async c=>{
   const r=await c.query<{id:string}>(`INSERT INTO service_zones(code,name,regular_fee_kobo,premium_fee_kobo,active)
    VALUES($1,$2,$3,$4,false) RETURNING id`,
    [data.code,data.name,data.regularFeeKobo,data.premiumFeeKobo]);
   return r.rows[0]!.id;
  });
 }
 async offering(id:AuthenticatedIdentity,data:OfferingInput){
  return this.create(id,'offering','labs:manage',async c=>{
   const r=await c.query<{id:string}>(`INSERT INTO lab_offerings(lab_id,test_id,price_kobo,turnaround_hours,active)
    VALUES($1,$2,$3,$4,false) RETURNING id`,
    [data.labId,data.testId,data.priceKobo,data.turnaroundHours]);
   return r.rows[0]!.id;
  });
 }
 async slot(id:AuthenticatedIdentity,data:SlotInput){
  return this.create(id,'slot','orders:manage',async c=>{
   const r=await c.query<{id:string}>(`INSERT INTO collection_slots(zone_id,lab_id,tier,
     starts_at,ends_at,cutoff_at,capacity,active)
    VALUES($1,$2,$3,$4,$5,$6,$7,false) RETURNING id`,
    [data.zoneId,data.labId,data.tier,data.startsAt,data.endsAt,data.cutoffAt,data.capacity]);
   return r.rows[0]!.id;
  });
 }
 async reviews(identity:AuthenticatedIdentity){
  await this.authorize(identity,'orders:manage');
  const r=await this.db.query(`SELECT resource_type,resource_id,creator_id,created_at
   FROM catalog_review_requests WHERE approved_at IS NULL ORDER BY created_at LIMIT 50`);
  return {data:r.rows};
 }
 async approve(identity:AuthenticatedIdentity,type:CatalogType,id:string,reference:string){
  await this.authorize(identity,'orders:manage');
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
    const actor=await this.actor(c,identity);
    const r=await c.query<{creator_id:string;approver_id:string|null}>(`SELECT creator_id,approver_id
     FROM catalog_review_requests WHERE resource_type=$1 AND resource_id=$2 FOR UPDATE`,[type,id]);
    if(!r.rows[0])throw new NotFoundException('Pending catalogue request not found');
    if(r.rows[0].creator_id===actor)throw new ForbiddenException('Two-actor review required');
    if(r.rows[0].approver_id)throw new ConflictException('Item already approved');
    const table:{[K in CatalogType]:string}={
      test:'tests',laboratory:'laboratories',zone:'service_zones',
      offering:'lab_offerings',slot:'collection_slots'
    };
    if(type==='test'){
     const item=await c.query(`SELECT 1 FROM tests WHERE id=$1 AND
       length(trim(preparation_text))>=5`,[id]);
     if(!item.rows.length)throw new ConflictException('Clinical preparation information missing');
    }
    if(type==='offering'){
     const p=await c.query(`SELECT 1 FROM lab_offerings o JOIN laboratories l ON l.id=o.lab_id
      JOIN tests t ON t.id=o.test_id WHERE o.id=$1 AND l.active AND t.active`,[id]);
     if(!p.rows.length)throw new ConflictException('Laboratory or test is not yet enabled');
    }
    if(type==='slot'){
     const p=await c.query(`SELECT 1 FROM collection_slots s
      JOIN laboratories l ON l.id=s.lab_id JOIN service_zones z ON z.id=s.zone_id
      WHERE s.id=$1 AND l.active AND z.active AND s.cutoff_at>clock_timestamp()`,[id]);
     if(!p.rows.length)throw new ConflictException('Zone, laboratory or slot cutoff invalid');
    }
    const changed=await c.query('UPDATE '+table[type]+' SET active=true WHERE id=$1 RETURNING id',[id]);
    if(changed.rowCount!==1)throw new NotFoundException('Catalogue record missing');
    await c.query(`UPDATE catalog_review_requests
     SET approver_id=$3,evidence_reference=$4,approved_at=now()
     WHERE resource_type=$1 AND resource_id=$2`,[type,id,actor,reference]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'catalog.approved',$2,$3,jsonb_build_object('evidenceReference',$4))`,
     [actor,type,id,reference]);
    await c.query('COMMIT');
    return {resourceId:id,resourceType:type,status:'approved',active:true};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
