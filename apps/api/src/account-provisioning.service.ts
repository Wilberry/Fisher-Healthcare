import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthenticatedIdentity } from './identity';
@Injectable()
export class AccountProvisioningService implements OnModuleDestroy {
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});}
 async onModuleDestroy(){await this.pool?.end();}
 async provision(identity:AuthenticatedIdentity){
  if(process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' || process.env.NODE_ENV==='production')
   throw new ServiceUnavailableException('Patient onboarding not enabled');
  if(!this.pool)throw new ServiceUnavailableException('Database unavailable');
  const result=await this.pool.query<{id:string;email:string|null}>(`INSERT INTO users(identity_subject,email)
   VALUES($1,$2)
   ON CONFLICT(identity_subject) DO UPDATE
     SET email=COALESCE(EXCLUDED.email,users.email),updated_at=now()
   RETURNING id,email`,[identity.subject,identity.verifiedEmail??null]);
  return {accountId:result.rows[0]!.id,verifiedContactEmail:Boolean(result.rows[0]?.email)};
 }
}
