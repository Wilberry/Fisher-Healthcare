import {describe,it,expect} from 'vitest';
import {parseRefundRequest,parseRefundReview} from './refund-policy';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('refund approval input policy',()=>{
  it('allows exact, bounded non-clinical refund requests',()=>{
    const b={paymentId:id,requestKey:id,amountKobo:100,
      reasonCode:'cancelled_service'};
    expect(parseRefundRequest(b)).toEqual(b);
    expect(()=>parseRefundRequest({...b,amountKobo:0})).toThrow();
    expect(()=>parseRefundRequest({...b,amountKobo:1.5})).toThrow();
    expect(()=>parseRefundRequest({...b,cardNumber:'4111'})).toThrow();
    expect(()=>parseRefundRequest({...b,reasonCode:'unreviewed'})).toThrow();
    expect(()=>parseRefundRequest({...b,paymentId:id.toUpperCase()})).toThrow();
  });
  it('requires a documented and explicit independent reviewer decision',()=>{
    expect(parseRefundReview({decision:'approve',note:'Checked exception'}))
      .toEqual({decision:'approve',note:'Checked exception'});
    expect(()=>parseRefundReview({decision:'approve',note:'short'})).toThrow();
    expect(()=>parseRefundReview({decision:'approve',note:'Checked exception',actor:'client'}))
      .toThrow();
  });
});
