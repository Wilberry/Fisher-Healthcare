'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
type Row=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function FinanceActions({refunds,payables,batches}:{refunds:Row[];payables:Row[];batches:Row[]}){
 const [payment,setPayment]=useState(''),[amount,setAmount]=useState('');
 const [resultId,setResultId]=useState(''),[agreed,setAgreed]=useState('');
 const [agreement,setAgreement]=useState('');
 const [labId,setLabId]=useState(''),[payableIds,setPayableIds]=useState('');
 const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const router=useRouter();
 async function send(path:string,body:Record<string,unknown>){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/phase4/finance/'+path,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'
   });
   setMessage(res.ok?'Synthetic finance record accepted. Refreshing.':
     res.status===401?'Staff authentication expired.':
     res.status===403?'Independent finance authorization required.':
     res.status===409?'State conflict. Refresh and review prior decisions.':
     'Operation not confirmed. Refresh and check before retrying.');
   router.refresh();
  }catch{setMessage('Network outcome unknown; verify the queue before retrying.');}
  finally{setBusy(false);}
 }
 const submitRefund=(e:FormEvent)=>{
  e.preventDefault();const money=Number(amount);
  if(!uuid.test(payment)||!Number.isSafeInteger(money)||money<1)return;
  void send('refunds',{paymentId:payment,requestKey:crypto.randomUUID(),
    amountKobo:money,reasonCode:'manual_review'});
 };
 const submitPayable=(e:FormEvent)=>{
  e.preventDefault();const money=Number(agreed);
  if(!uuid.test(resultId)||!Number.isSafeInteger(money)||money<1)return;
  void send('lab-payables',{resultId,amountKobo:money,agreementReference:agreement});
 };
 const submitSettlement=(e:FormEvent)=>{
  e.preventDefault();const ids=payableIds.split(',').map(v=>v.trim());
  if(!uuid.test(labId)||ids.length===0||!ids.every(v=>uuid.test(v)))return;
  void send('lab-settlements',{labId,batchKey:crypto.randomUUID(),payableIds:ids});
 };
 function review(path:string,decision:'approve'|'reject'){
  if(note.trim().length<10||note.trim().length>240)return;
  void send(path,{decision,note:note.trim()});
 }
 return <section aria-label="Synthetic finance approvals">
  <h2>Request a refund review</h2>
  <form onSubmit={submitRefund}>
   <p><label>Paid payment UUID <input value={payment} onChange={e=>setPayment(e.target.value)} required/></label></p>
   <p><label>Amount (kobo) <input type="number" min="1" value={amount}
     onChange={e=>setAmount(e.target.value)} required/></label></p>
   <button type="submit" disabled={busy}>Submit for independent review</button>
  </form>
  <h2>Record a synthetic lab payable</h2>
  <form onSubmit={submitPayable}>
   <p><label>Released result UUID <input required value={resultId}
     onChange={e=>setResultId(e.target.value)}/></label></p>
   <p><label>Agreed lab amount (kobo) <input type="number" min="1" required
     value={agreed} onChange={e=>setAgreed(e.target.value)}/></label></p>
   <p><label>Synthetic contract reference <input required value={agreement}
     onChange={e=>setAgreement(e.target.value)} placeholder="SYN-AGREEMENT-0001"/></label></p>
   <button type="submit" disabled={busy}>Record verified payable</button>
  </form>
  <h2>Prepare a settlement batch</h2>
  <form onSubmit={submitSettlement}>
   <p><label>Laboratory UUID <input required value={labId}
     onChange={e=>setLabId(e.target.value)}/></label></p>
   <p><label>Payable UUIDs (comma separated) <textarea required rows={2}
     value={payableIds} onChange={e=>setPayableIds(e.target.value)}/></label></p>
   <button type="submit" disabled={busy}>Submit batch for review</button>
  </form>
  <h2>Independent finance decisions</h2>
  <p><label>Decision justification (10–240 characters)
   <textarea minLength={10} maxLength={240} rows={2}
     value={note} onChange={e=>setNote(e.target.value)}/></label></p>
  <h3>Pending refunds</h3>
  <ul>{refunds.filter(r=>r.status==='pending'&&typeof r.id==='string'&&uuid.test(r.id)).map(r=>
   <li key={String(r.id)}>{String(r.id)}{' '}
    <button disabled={busy||note.trim().length<10}
      onClick={()=>review('refunds/'+String(r.id)+'/review','approve')}>Approve</button>{' '}
    <button disabled={busy||note.trim().length<10}
      onClick={()=>review('refunds/'+String(r.id)+'/review','reject')}>Reject</button>
   </li>)}</ul>
  <h3>Pending laboratory settlement batches</h3>
  <ul>{batches.filter(r=>r.status==='pending'&&typeof r.id==='string'&&uuid.test(r.id)).map(r=>
   <li key={String(r.id)}>{String(r.id)}{' '}
    <button disabled={busy||note.trim().length<10}
      onClick={()=>review('lab-settlements/'+String(r.id)+'/review','approve')}>Approve</button>{' '}
    <button disabled={busy||note.trim().length<10}
      onClick={()=>review('lab-settlements/'+String(r.id)+'/review','reject')}>Reject</button>
   </li>)}</ul>
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
