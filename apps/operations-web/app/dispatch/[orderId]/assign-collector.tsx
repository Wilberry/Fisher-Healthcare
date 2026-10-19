'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

interface Shift {shiftId:string;staffId:string;zone:string;start:string}
export function AssignCollector({orderId,shifts}:{orderId:string;shifts:Shift[]}){
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const router=useRouter();
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    const shift=shifts.find(item=>item.shiftId===selected);
    if(!shift){setMessage('Select an eligible collector shift.');return;}
    setBusy(true);setMessage('');
    try{
      const result=await fetch('/api/phase3/ops/assignments',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({orderId,staffId:shift.staffId,shiftId:shift.shiftId})
      });
      if(!result.ok){
        setMessage(result.status===409?'Assignment changed; refresh the available shifts.':
          'Assignment was rejected. Check access, payment and staff availability.');
        router.refresh();
        return;
      }
      setMessage('Collector assignment was accepted. Updating dispatch.');
      router.push('/dispatch');
      router.refresh();
    }catch{setMessage('Dispatch service unreachable. Check the queue before retrying.');}
    finally{setBusy(false);}
  }
  return <form onSubmit={event=>void submit(event)}>
    <h2>Eligible worker shifts</h2>
    {!shifts.length?<p role="status">No available collector shift currently matches this booking.</p>:
      <>
        <label htmlFor="eligible-shift">Worker shift</label>
        <select id="eligible-shift" required value={selected}
          onChange={event=>setSelected(event.target.value)} style={{display:'block',padding:12,marginBottom:16}}>
          <option value="">Select a shift</option>
          {shifts.map(item=><option key={item.shiftId} value={item.shiftId}>
            {item.zone} · Shift {item.shiftId.slice(0,8)} · Staff {item.staffId.slice(0,8)}
            {item.start?' · '+item.start:''}
          </option>)}
        </select>
        <button type="submit" disabled={busy||!selected}>
          {busy?'Assigning…':'Confirm collector assignment'}
        </button>
      </>}
    <p role="status" aria-live="polite">{message}</p>
    <p>Eligibility is checked again in the database before an assignment is recorded.</p>
  </form>;
}
