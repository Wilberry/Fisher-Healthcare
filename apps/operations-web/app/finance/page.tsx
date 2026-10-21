import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
import {FinanceActions} from './finance-actions';
export const dynamic='force-dynamic';
type Row=Record<string,unknown>;
const visible=(rows:Row[],fields:string[])=>
 rows.map(row=>Object.fromEntries(fields.filter(k=>typeof row[k]==='string'||
   typeof row[k]==='number').map(k=>[k,row[k]])) as Row);
export default async function Finance(){
 const [transactions,refunds,payables,settlements,runs,copies]=await Promise.all([
  staffApi('finance/transactions'),staffApi('finance/refunds'),
  staffApi('finance/lab-payables'),staffApi('finance/lab-settlements'),
  staffApi('finance/reconciliation'),staffApi('finance/physical-copies')]);
 const allowed=[transactions,refunds,payables,settlements,runs,copies].every(r=>r.authorized);
 const refundRows=visible(refunds.records,['id','payment_id','amount_kobo','status']);
 const payableRows=visible(payables.records,['id','lab_id','result_id','amount_kobo','assigned_batch']);
 const batchRows=visible(settlements.records,['id','lab_id','total_kobo','status']);
 const copyRows=visible(copies.records,['id','status','quote_kobo']);
 return <SiteShell subtitle="Operations · Finance"
   navigation={[{href:'/',label:'Operations'},{href:'/results',label:'Result review'}]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Phase 4 · Internal finance</p>
   <h1 className="fisher-section-title">Reconciliation, refunds and lab settlements</h1>
   {!allowed?<Notice title="Verified finance access required" tone="warning">
      No financial records are displayed without current finance authorization.
      {oidcConfig()&&<p><Link href="/auth/login?next=%2Ffinance">Staff sign in</Link></p>}
    </Notice>:<>
    <Notice title="Synthetic-only accounting">No refunds, bank transfers or laboratory payouts
      are executed here. Approvals are internal records, not evidence of payment.</Notice>
    <h2>Payment checks</h2>
    <p>{transactions.records.length} transaction records returned; {runs.records.length} reconciliation runs.</p>
    <ul>{transactions.records.slice(0,40).map((row,i)=>
      <li key={typeof row.paymentId==='string'?row.paymentId:i}>
       {String(row.paymentId??'Unknown')} · {String(row.status??'unknown')} ·
       {String(row.ledgerException??'balanced')}
      </li>)}</ul>
    <h2>Refund requests</h2>
    <ul>{refundRows.map((row,i)=><li key={String(row.id??i)}>
     {String(row.id)} · {String(row.amount_kobo)} kobo · {String(row.status)}
    </li>)}</ul>
    <h2>Lab payables</h2>
    <ul>{payableRows.map((row,i)=><li key={String(row.id??i)}>
      {String(row.id)} · {String(row.amount_kobo)} kobo
    </li>)}</ul>
    <h2>Settlement batches</h2>
    <ul>{batchRows.map((row,i)=><li key={String(row.id??i)}>
      {String(row.id)} · {String(row.total_kobo)} kobo · {String(row.status)}
    </li>)}</ul>
    <h2>Physical-copy quote requests</h2>
    <p>Quotes only: no payment, courier dispatch or delivery proof is recorded.</p>
    <ul>{copyRows.map((r,i)=><li key={String(r.id??i)}>
      {String(r.id)} · {String(r.status)} {r.quote_kobo!=null?'· '+String(r.quote_kobo)+' kobo':''}
    </li>)}</ul>
    <FinanceActions refunds={refundRows} payables={payableRows}
      batches={batchRows} physicalCopies={copyRows}/>
   </>}
   <p><Link href="/">Return to operations</Link></p>
  </div></section>
 </SiteShell>;
}
