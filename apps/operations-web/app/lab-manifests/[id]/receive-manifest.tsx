'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
type Specimen={id:string;status:string;custodyVersion:number};
const reasons=['label_mismatch','leakage','temperature_excursion',
  'damaged_container','quantity_mismatch','other'] as const;
export function ReceiveManifest({id,status,specimens}:{
  id:string;status:string;specimens:Specimen[]
}){
  const [rejected,setRejected]=useState<string[]>([]);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const key=useRef<string|null>(null);
  const router=useRouter();
  async function receive(){
    if(busy||status!=='prepared'||!specimens.length)return;
    const rejectedIds=specimens.filter(x=>rejected.includes(x.id)).map(x=>x.id);
    const acceptedIds=specimens.filter(x=>!rejected.includes(x.id)).map(x=>x.id);
    if(rejectedIds.length&&!reasons.some(value=>value===reason)){
      setMessage('Select a controlled rejection reason for rejected specimens.');return;
    }
    if(!key.current)key.current=crypto.randomUUID();
    setBusy(true);setMessage('');
    try{
      const result=await fetch('/api/phase3/ops/lab-manifests/'+id+'/receipt',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({receiptKey:key.current,acceptedIds,rejectedIds,
          ...(rejectedIds.length?{rejectionCode:reason}:{})})
      });
      if(!result.ok){
        if(result.status===409)key.current=null;
        setMessage(result.status===409?'Manifest state has changed; refresh before continuing.':
          'Lab receipt declined. Verify the active laboratory grant and all specimen states.');
        router.refresh();return;
      }
      key.current=null;setRejected([]);
      setMessage('Lab receipt and custody updates committed. Refreshing.');
      router.refresh();
    }catch{
      // Preserve the same key for an unknown response; a repeated matching
      // receipt cannot advance custody twice.
      setMessage('Network response unknown. Retry with the same selections to recover this receipt.');
    }finally{setBusy(false);}
  }
  return <section className="fisher-section">
    <h2>Review the full specimen set</h2>
    <p>Every specimen must be physically checked before this receipt is signed.
      Accepted here means received at the laboratory, not clinically accepted or released.</p>
    <ul>{specimens.map(s=><li key={s.id} style={{marginBottom:14}}>
      <label>
        <input type="checkbox" checked={rejected.includes(s.id)} disabled={busy||status!=='prepared'}
          onChange={event=>{
            key.current=null;
            setRejected(current=>event.target.checked?[...current,s.id]:current.filter(x=>x!==s.id));
          }}/>
        Reject specimen {s.id.slice(0,8)} (currently {s.status})
      </label>
    </li>)}</ul>
    {rejected.length>0&&<label htmlFor="rejection-reason">Reason for physical rejection
      <select id="rejection-reason" value={reason} disabled={busy}
        onChange={event=>{key.current=null;setReason(event.target.value);}}
        style={{display:'block',padding:10}}>
        <option value="">Select controlled reason</option>
        {reasons.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}
      </select>
    </label>}
    {status==='prepared'?
      <button type="button" disabled={busy||specimens.length===0||
        (rejected.length>0&&!reason)} onClick={()=>void receive()}>
        {busy?'Recording receipt…':'Confirm laboratory receipt'}
      </button>:<p role="status">This manifest is already finalized; no new receipt may be submitted.</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
