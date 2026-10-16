import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { validPaystackSignature, verifiedPaymentMatches } from './payment.service';
describe('Paystack authenticity and verified transaction invariants',()=>{
 const secret='sk_test_synthetic_secret';
 const raw=Buffer.from('{"event":"charge.success","data":{"reference":"test"}}');
 const signed=createHmac('sha512',secret).update(raw).digest('hex');
 it('verifies exact signed bytes and rejects mutation',()=>{
  expect(validPaystackSignature(raw,signed,secret)).toBe(true);
  expect(validPaystackSignature(Buffer.from(raw.toString()+' '),signed,secret)).toBe(false);
  expect(validPaystackSignature(raw,'bad',secret)).toBe(false);
  expect(validPaystackSignature(raw,undefined,secret)).toBe(false);
 });
 it('demands independently verified settlement, NGN, reference and amount',()=>{
  const record={reference:'test',amount:350000,currency:'NGN',status:'success',paid_at:'2026-10-16T12:00:00Z'};
  expect(verifiedPaymentMatches(record,'test',350000)).toBe(true);
  expect(verifiedPaymentMatches({...record,amount:350001},'test',350000)).toBe(false);
  expect(verifiedPaymentMatches({...record,currency:'USD'},'test',350000)).toBe(false);
  expect(verifiedPaymentMatches({...record,status:'pending'},'test',350000)).toBe(false);
  expect(verifiedPaymentMatches({...record,reference:'other'},'test',350000)).toBe(false);
  expect(verifiedPaymentMatches({...record,paid_at:null},'test',350000)).toBe(false);
 });
});
