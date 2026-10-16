import { randomBytes,randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { PublicRateLimitService } from './public-rate-limit.service';
const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&process.env.DATABASE_URL?
 describe:describe.skip;
suite.sequential('synthetic public-request rate limiting',()=>{
 let db:Pool,rate:PublicRateLimitService;
 const remote='synthetic:'+randomUUID();
 const previous={booking:process.env.FISHER_PHASE2_BOOKING_MODE,
  pepper:process.env.FISHER_PUBLIC_RATE_PEPPER};
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('No disposable DB');
  db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
  if((await db.query('SELECT current_database() AS name')).rows[0]?.name!=='fisher_test')
   throw new Error('Refusing non-synthetic database');
  process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
  process.env.FISHER_PUBLIC_RATE_PEPPER=randomBytes(32).toString('base64url');
  rate=new PublicRateLimitService();
 });
 afterAll(async()=>{
  await rate?.onModuleDestroy();await db?.end();
  if(previous.booking===undefined)delete process.env.FISHER_PHASE2_BOOKING_MODE;
  else process.env.FISHER_PHASE2_BOOKING_MODE=previous.booking;
  if(previous.pepper===undefined)delete process.env.FISHER_PUBLIC_RATE_PEPPER;
  else process.env.FISHER_PUBLIC_RATE_PEPPER=previous.pepper;
 });
 it('fails closed when the per-environment HMAC secret is absent',async()=>{
  const saved=process.env.FISHER_PUBLIC_RATE_PEPPER;
  delete process.env.FISHER_PUBLIC_RATE_PEPPER;
  await expect(rate.enforce(remote,'quote')).rejects.toThrow();
  process.env.FISHER_PUBLIC_RATE_PEPPER=saved;
 });
 it('enforces a shared 6-per-minute guest start threshold without plaintext IP storage',async()=>{
  for(let i=0;i<6;i++)await expect(rate.enforce(remote,'guest-start')).resolves.toBeUndefined();
  await expect(rate.enforce(remote,'guest-start')).rejects.toThrow('Request rate exceeded');
  const rows=await db.query(`SELECT network_hash,route,requests
    FROM public_rate_limits WHERE route='guest-start' AND requests>=7`);
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0].network_hash).not.toContain(remote);
 });
 it('isolates public scope and different source identities',async()=>{
  await expect(rate.enforce(remote,'quote')).resolves.toBeUndefined();
  await expect(rate.enforce(remote+'-other','guest-start')).resolves.toBeUndefined();
 });
});
