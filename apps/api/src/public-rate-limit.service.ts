import { createHmac } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
export type PublicRateScope='availability'|'quote'|'guest-start'|'guest-verify';
const limits:Record<PublicRateScope,number>={
 availability:30,quote:15,'guest-start':6,'guest-verify':15
};
@Injectable()
export class PublicRateLimitService implements OnModuleDestroy{
 private readonly pool?:Pool;
 constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});}
 async onModuleDestroy(){await this.pool?.end();}
 async enforce(ip:string|undefined,scope:PublicRateScope){
  if(process.env.NODE_ENV==='production' || process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic')
   throw new ServiceUnavailableException('Public quote and assisted intake not activated');
  const secret=process.env.FISHER_PUBLIC_RATE_PEPPER;
  if(!this.pool || !secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)||!ip||ip.length>100)
   throw new ServiceUnavailableException('Public rate limiter not configured');
  const key=createHmac('sha256',Buffer.from(secret,'base64url')).update(ip).digest('hex');
  const result=await this.pool.query<{requests:number}>(`INSERT INTO public_rate_limits(
     network_hash,route,window_started_at,requests)
   VALUES($1,$2,date_trunc('minute',clock_timestamp()),1)
   ON CONFLICT (network_hash,route,window_started_at) DO UPDATE
    SET requests=public_rate_limits.requests+1 RETURNING requests`,[key,scope]);
  if((result.rows[0]?.requests??limits[scope]+1)>limits[scope])
   throw new HttpException('Request rate exceeded',HttpStatus.TOO_MANY_REQUESTS);
 }
 async expireOld(){
  if(process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')return;
  await this.pool?.query("DELETE FROM public_rate_limits WHERE window_started_at<clock_timestamp()-interval '2 days'");
 }
}
