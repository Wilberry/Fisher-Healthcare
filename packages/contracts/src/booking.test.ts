import { describe, expect, it } from 'vitest';
import { bookingQuoteInput, quoteTotals } from './booking';
const UUID='00000000-0000-4000-8000-000000000001';
describe('phase 2 quote boundaries', () => {
 it('quotes in integer NGN kobo only',()=>expect(quoteTotals([150000,230000],75000)).toEqual({testsTotalKobo:380000,logisticsFeeKobo:75000,totalKobo:455000,currency:'NGN'}));
 it('rejects overflow and non-integer prices',()=>{
  expect(()=>quoteTotals([2147483647],1)).toThrow();
  expect(()=>quoteTotals([1.5],1)).toThrow();
  expect(()=>quoteTotals([],100)).toThrow();
 });
 it('rejects duplicate selected tests and unexpected fields',()=>{
  const request={zoneId:UUID,slotId:UUID,labId:UUID,serviceTier:'regular',testIds:[UUID,UUID]};
  expect(bookingQuoteInput.safeParse(request).success).toBe(false);
  expect(bookingQuoteInput.safeParse({...request,testIds:[UUID],totalKobo:0}).success).toBe(false);
 });
});
