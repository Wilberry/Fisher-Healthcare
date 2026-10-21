import {describe,it,expect} from 'vitest';
import {reconciliationReason,type LedgerSnapshot} from './reconciliation-policy';
const paid:LedgerSnapshot={id:'test',status:'paid',amount_kobo:15000,
  clearing_kobo:'15000',receivable_kobo:'-15000',entry_count:2,other_count:0};
describe('financial reconciliation checks (synthetic only)',()=>{
  it('accepts a verified payment only when both posting entries balance',()=>{
    expect(reconciliationReason(paid)).toBeNull();
    expect(reconciliationReason({...paid,clearing_kobo:'14999'}))
      .toBe('paid_ledger_mismatch');
    expect(reconciliationReason({...paid,entry_count:4}))
      .toBe('paid_ledger_mismatch');
    expect(reconciliationReason({...paid,receivable_kobo:'-14999'}))
      .toBe('paid_ledger_mismatch');
    expect(reconciliationReason({...paid,other_count:1}))
      .toBe('paid_ledger_mismatch');
  });
  it('flags ledger movements without verified payments and unimplemented refunds',()=>{
    expect(reconciliationReason({...paid,status:'pending',entry_count:0}))
      .toBeNull();
    expect(reconciliationReason({...paid,status:'failed'}))
      .toBe('unexpected_ledger');
    expect(reconciliationReason({...paid,status:'refunded'}))
      .toBe('refund_not_reconciled');
    expect(reconciliationReason({...paid,status:'partially_refunded'}))
      .toBe('refund_not_reconciled');
  });
});
