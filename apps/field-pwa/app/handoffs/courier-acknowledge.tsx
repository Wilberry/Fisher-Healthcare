'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function CourierAcknowledge({id,specimenIds}:{
  id:string;specimenIds:string[]
}){
  const [confirmed,setConfirmed]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const key=useRef<string|null>(null);
  const router=useRouter();
  async function send(){
    if(specimenIds.length===0||specimenIds.some(id=>!confirmed.includes(id))||busy)return;
    if(!key.current)key.current=crypto.randomUUID();
    setBusy(true);setMessage('');
    try{
      const result=await fetch('/api/phase3/field/handoff-offers/'+id+'/ack',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({receiptKey:key.current})
      });
      if(!result.ok){
        if(result.status===409)key.current=null;
        setMessage(result.status===409?'Handoff or specimen state changed. Review before resubmitting.':
          'Acknowledgment denied. Confirm your assigned courier identity and MFA.');
        router.refresh();return;
      }
      key.current=null;setConfirmed([]);
      setMessage('Courier receipt accepted; custody updated atomically.');
      router.refresh();
    }catch{
      setMessage('The response is unknown; retry this acknowledgment with the same receipt key.');
    }finally{setBusy(false);}
  }
  return <section>
    <p>Check each specimen identifier against the label on the physically received package.</p>
    <ul>{specimenIds.map(specimenId=><li key={specimenId} style={{marginBottom:10}}>
      <label>
        <input type="checkbox" checked={confirmed.includes(specimenId)} disabled={busy}
          onChange={event=>setConfirmed(current=>event.target.checked ?
            [...current,specimenId] : current.filter(item=>item!==specimenId))}/>
        {' '}Physically received specimen {specimenId}
      </label>
    </li>)}</ul>
    <div style={{marginTop:10}}>
      <button type="button"
        disabled={!specimenIds.length||specimenIds.some(id=>!confirmed.includes(id))||busy} onClick={()=>void send()}>
        {busy?'Recording acknowledgment…':'Acknowledge as receiving courier'}
      </button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
