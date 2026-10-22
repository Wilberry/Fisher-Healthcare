export type LedgerSnapshot={
  id:string;status:string;amount_kobo:number;clearing_kobo:string;
  receivable_kobo:string;entry_count:number;other_count:number
};
export type ReconciliationReason=
  'paid_ledger_mismatch'|'unexpected_ledger'|'refund_not_reconciled';
/** Read-only classification of settled customer payments against the balanced ledger. */
export function reconciliationReason(row:LedgerSnapshot):ReconciliationReason|null{
  if(row.status==='refunded'||row.status==='partially_refunded')
    return 'refund_not_reconciled';
  if(row.status==='paid'){
    if(row.entry_count===2&&row.other_count===0 &&
       BigInt(row.clearing_kobo)===BigInt(row.amount_kobo) &&
       BigInt(row.receivable_kobo)===-BigInt(row.amount_kobo))return null;
    return 'paid_ledger_mismatch';
  }
  if(row.entry_count!==0)return 'unexpected_ledger';
  return null;
}
