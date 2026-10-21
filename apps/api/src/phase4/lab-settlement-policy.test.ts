import {describe,it,expect} from 'vitest';
import {parsePayable,parseSettlement} from './lab-settlement-policy';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('synthetic laboratory settlement input',()=>{
 it('rejects unverified rates and arbitrary partner bank details',()=>{
  const p={resultId:id,amountKobo:1500,agreementReference:'SYN-AGREEMENT-0001'};
  expect(parsePayable(p)).toEqual(p);
  expect(()=>parsePayable({...p,accountNumber:'1234567890'})).toThrow();
  expect(()=>parsePayable({...p,agreementReference:'Commercial agreement'})).toThrow();
  expect(()=>parsePayable({...p,amountKobo:0})).toThrow();
 });
 it('requires distinct canonical payable IDs and bounded batch size',()=>{
  const b={batchKey:id,labId:id,payableIds:[id]};
  expect(parseSettlement(b)).toEqual(b);
  expect(()=>parseSettlement({...b,payableIds:[id,id]})).toThrow();
  expect(()=>parseSettlement({...b,payableIds:Array(51).fill(id)})).toThrow();
  expect(()=>parseSettlement({...b,bankAccount:'untrusted'})).toThrow();
 });
});
