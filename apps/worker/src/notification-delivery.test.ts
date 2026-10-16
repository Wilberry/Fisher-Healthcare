import { afterEach,describe,expect,it,vi } from 'vitest';
import type { Pool } from 'pg';
import { dispatchNotification,stagingEmailSettings } from './notification-delivery';

const original={
 mode:process.env.FISHER_PHASE2_EMAIL_MODE,
 booking:process.env.FISHER_PHASE2_BOOKING_MODE,
 key:process.env.RESEND_API_KEY,
 sender:process.env.FISHER_STAGING_EMAIL_FROM,
 allowed:process.env.FISHER_STAGING_EMAIL_ALLOWLIST
};
function enable(){
 process.env.FISHER_PHASE2_EMAIL_MODE='staging';
 process.env.FISHER_PHASE2_BOOKING_MODE='synthetic';
 process.env.RESEND_API_KEY='re_synthetic';
 process.env.FISHER_STAGING_EMAIL_FROM='synthetic@example.test';
 process.env.FISHER_STAGING_EMAIL_ALLOWLIST='approved@example.test';
}
afterEach(()=>{
 for(const [key,val] of Object.entries({
  FISHER_PHASE2_EMAIL_MODE:original.mode,FISHER_PHASE2_BOOKING_MODE:original.booking,
  RESEND_API_KEY:original.key,FISHER_STAGING_EMAIL_FROM:original.sender,
  FISHER_STAGING_EMAIL_ALLOWLIST:original.allowed
 })){if(val===undefined)delete process.env[key];else process.env[key]=val;}
 vi.restoreAllMocks();
});
describe('notification provider idempotency and acceptance receipts',()=>{
 it('does not call a provider unless the explicit staging gates are enabled',async()=>{
  delete process.env.FISHER_PHASE2_EMAIL_MODE;
  expect(stagingEmailSettings()).toBeNull();
  const db={query:vi.fn()} as unknown as Pool;
  const send=vi.fn();
  expect(await dispatchNotification(db,send as typeof fetch)).toBe(false);
  expect(send).not.toHaveBeenCalled();
 });
 it('records sent state only after a successful provider acceptance identifier',async()=>{
  enable();
  const claim={id:'11111111-1111-4111-8111-111111111111',order_id:'22222222-2222-4222-8222-222222222222',
   recipient:'approved@example.test',lease_token:'33333333-3333-4333-8333-333333333333',
   attempts:1,first_attempt_at:new Date()};
  const query=vi.fn().mockResolvedValueOnce({rowCount:0,rows:[]})
   .mockResolvedValueOnce({rowCount:1,rows:[claim]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:claim.id}]});
  const send=vi.fn(async()=>new Response(JSON.stringify({id:'accepted-email-123456'}),
   {status:200,headers:{'content-type':'application/json'}}));
  const result=await dispatchNotification({query} as unknown as Pool,send);
  expect(result).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  const request=send.mock.calls[0]!;
  expect(request[0]).toBe('https://api.resend.com/emails');
  const opts=request[1] as RequestInit;
  const headers=opts.headers as Record<string,string>;
  expect(headers['Idempotency-Key']).toBe('fisher-booking-confirmed-'+claim.id);
  const payload=JSON.parse(String(opts.body)) as Record<string,unknown>;
  expect(payload.to).toEqual(['approved@example.test']);
  expect(JSON.stringify(payload)).not.toContain('patient');
  const recorded=String(query.mock.calls[2]![0]);
  expect(recorded).toContain("status='sent'");
  expect(query.mock.calls[2]![1]).toEqual([claim.id,claim.lease_token,'accepted-email-123456']);
 });
 it('never claims delivery when provider acceptance is missing',async()=>{
  enable();
  const claim={id:'11111111-1111-4111-8111-111111111111',
   order_id:'22222222-2222-4222-8222-222222222222',
   recipient:'approved@example.test',lease_token:'33333333-3333-4333-8333-333333333333',
   attempts:2,first_attempt_at:new Date()};
  const query=vi.fn().mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[claim]})
   .mockResolvedValueOnce({rowCount:1,rows:[]});
  const send=vi.fn(async()=>{throw new Error('Synthetic provider timeout');});
  expect(await dispatchNotification({query} as unknown as Pool,send as typeof fetch)).toBe(true);
  expect(String(query.mock.calls[2]![0])).not.toContain("status='sent'");
  expect(String(query.mock.calls[2]![0])).toContain("status=CASE");
 });
});
