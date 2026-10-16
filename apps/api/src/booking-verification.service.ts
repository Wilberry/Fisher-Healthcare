import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { AccessService } from './access.service';
import { type AuthenticatedIdentity, requireStaffMfa } from './identity';
@Injectable()
export class BookingVerificationService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});
 }
 async onModuleDestroy(){await this.pool?.end();}
 async approve(identity:AuthenticatedIdentity,relationshipId:string,evidenceReference:string){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Verification workflow not activated');
  requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'orders:manage');
  if(!this.pool)throw new ServiceUnavailableException('Database unavailable');
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');
   try{
    const actor=await c.query<{id:string}>('SELECT id FROM users WHERE identity_subject=$1',[identity.subject]);
    if(!actor.rows[0])throw new ForbiddenException('Reviewer not provisioned');
    const relationship=await c.query<{id:string;patient_id:string;user_id:string;verified_at:Date|null;revoked_at:Date|null}>(
     'SELECT id,patient_id,user_id,verified_at,revoked_at FROM patient_relationships WHERE id=$1 FOR UPDATE',[relationshipId]);
    const row=relationship.rows[0];
    if(!row)throw new NotFoundException('Relationship not found');
    if(row.revoked_at || row.verified_at)throw new ConflictException('Relationship already reviewed or revoked');
    if(row.user_id===actor.rows[0].id)throw new ForbiddenException('Reviewer cannot approve their own relationship');
    await c.query(`UPDATE patient_relationships SET can_book=true,can_view_results=false,
      verified_at=now(),updated_at=now() WHERE id=$1 AND verified_at IS NULL AND revoked_at IS NULL`,[relationshipId]);
    await c.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'patient.booking_verified','patient_relationship',$2,
       jsonb_build_object('evidenceReference',$3,'resultAccessGranted',false))`,
       [actor.rows[0].id,relationshipId,evidenceReference]);
    await c.query('COMMIT');
    return {relationshipId,canBook:true,canViewResults:false,status:'approved_for_booking'};
   }catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
}
