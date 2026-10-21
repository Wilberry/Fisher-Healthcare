import {describe,it,expect} from 'vitest';
import {parsePhysicalCopyRequest,parsePhysicalCopyQuote} from './physical-copy-policy';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('physical-copy request and quote inputs',()=>{
 it('accepts only patient result, approved address and an idempotency key',()=>{
  const input={resultId:id,addressId:id,requestKey:id};
  expect(parsePhysicalCopyRequest(input)).toEqual(input);
  expect(()=>parsePhysicalCopyRequest({...input,recipientName:'unverified'})).toThrow();
  expect(()=>parsePhysicalCopyRequest({...input,resultId:id.toUpperCase()})).toThrow();
  expect(()=>parsePhysicalCopyRequest({...input,deliveryPrice:0})).toThrow();
 });
 it('bounds the synthetic quote and disallows browser-submitted payment proof',()=>{
  expect(parsePhysicalCopyQuote({amountKobo:20000})).toEqual({amountKobo:20000});
  expect(()=>parsePhysicalCopyQuote({amountKobo:0})).toThrow();
  expect(()=>parsePhysicalCopyQuote({amountKobo:2000001})).toThrow();
  expect(()=>parsePhysicalCopyQuote({amountKobo:20.5})).toThrow();
  expect(()=>parsePhysicalCopyQuote({amountKobo:20000,paymentVerified:true})).toThrow();
 });
});
