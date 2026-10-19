'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FieldAssignment } from '../../../lib/staff-auth';

const canCollect=(status:string)=>status==='collecting';
const isUid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
export function FieldVisitActions({assignment}:{assignment:FieldAssignment}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [barcodes,setBarcodes]=useState<Record<string,string>>({});
  const pending=useRef<Map<string,string>>(new Map());
  const [online,setOnline]=useState(true);
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    update();
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  function keyFor(operation:string){
    const current=pending.current.get(operation);
    if(current)return current;
    const key=crypto.randomUUID();
    pending.current.set(operation,key);
    return key;
  }
  async function send(operation:string,path:string,payload:Record<string,unknown>){
    if(busy)return;
    if(!online){
      setMessage('Offline. Nothing was submitted; no specimen data is stored on this device.');
      return;
    }
    if(!isUid(assignment.id))return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch(path,{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify(payload),
        cache:'no-store'});
      if(!response.ok){
        setMessage(response.status===409 ?
          'Conflict: the visit or specimen changed. Review the latest server status before retrying.' :
          'Operation not accepted. Verify your assignment and staff session before retrying.');
        router.refresh();
        return;
      }
      pending.current.delete(operation);
      setMessage('Event accepted and recorded. Updating the assigned visit.');
      router.refresh();
    }catch{
      // Preserve this event ID only in memory so a manual retry is idempotent.
      // No barcode, patient record, session or specimen data is cached offline.
      setMessage('The network response is unknown. Retry this same action to recover its receipt.');
    }finally{setBusy(false);}
  }
  function assignmentEvent(action:'arrive'|'start_collection'){
    const operation='assignment:'+action;
    return send(operation,'/api/phase3/field/assignments/'+assignment.id+'/events',{
      eventId:keyFor(operation),action,expectedVersion:assignment.eventVersion
    });
  }
  function specimenEvent(id:string,action:'collect'|'package',version:number){
    const operation='specimen:'+id+':'+action;
    return send(operation,'/api/phase3/field/specimens/'+id+'/events',{
      eventId:keyFor(operation),action,expectedVersion:version
    });
  }
  function labelCheck(id:string,version:number){
    const barcode=(barcodes[id]??'').trim();
    if(!barcode){setMessage('Scan or enter the actual specimen barcode first.');return;}
    const operation='label:'+id;
    // Barcode is sent to the server for comparison and never kept in storage.
    return send(operation,'/api/phase3/field/specimens/'+id+'/label-check',{
      eventId:keyFor(operation),observedBarcode:barcode,expectedVersion:version
    }).finally(()=>setBarcodes(values=>({...values,[id]:''})));
  }
  return <section className="fisher-section" aria-labelledby="field-visit-actions">
    <h2 id="field-visit-actions" className="fisher-section-title">Record collection events</h2>
    <Notice title="Restricted synthetic field workflow" tone="warning">
      Physical collection requires approved patient identity verification, consent and clinical SOPs.
      A successful barcode check alone does not establish patient identity.
    </Notice>
    {!online&&<p role="alert">Offline: actions are disabled. No persistent patient or specimen information is stored.</p>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
      {assignment.status==='assigned'&&
        <button type="button" disabled={busy||!online} onClick={()=>void assignmentEvent('arrive')}>
          Mark arrived
        </button>}
      {assignment.status==='arrived'&&
        <button type="button" disabled={busy||!online}
          onClick={()=>void assignmentEvent('start_collection')}>Start collection</button>}
    </div>
    <h3>Assigned specimens</h3>
    <div className="fisher-grid">
      {assignment.specimens.map(specimen=><div key={specimen.id} className="fisher-card"
        style={{padding:16}}>
        <h4>Specimen {specimen.id.slice(0,8)}</h4>
        <p>Custody: {specimen.status.replaceAll('_',' ')} · Version {specimen.custodyVersion}</p>
        {canCollect(assignment.status)&&specimen.status==='planned'&&<>
          <label htmlFor={'label-'+specimen.id}>Scan the barcode printed on this specimen
            <input id={'label-'+specimen.id} value={barcodes[specimen.id]??''} autoComplete="off"
              maxLength={100} onChange={e=>setBarcodes(values=>({...values,[specimen.id]:e.target.value}))}
              style={{display:'block',padding:10,marginTop:8,width:'100%'}}/>
          </label>
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <button type="button" disabled={busy||!online}
              onClick={()=>void labelCheck(specimen.id,specimen.custodyVersion)}>Verify label</button>
            <button type="button" disabled={busy||!online}
              onClick={()=>void specimenEvent(specimen.id,'collect',specimen.custodyVersion)}>
              Record collection
            </button>
          </div>
        </>}
        {canCollect(assignment.status)&&specimen.status==='collected'&&
          <button type="button" disabled={busy||!online}
            onClick={()=>void specimenEvent(specimen.id,'package',specimen.custodyVersion)}>
            Record packaging
          </button>}
      </div>)}
    </div>
    <p role="status" aria-live="polite">{message}</p>
    <p>No offline event queue is persisted. Keep the app open during a temporary
      connection interruption; reloads can discard unsent actions.</p>
  </section>;
}
