'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FieldAssignment } from '../../../lib/staff-auth';
import { Notice } from '@fisher/ui';
import {useSyntheticRecovery} from '../../../lib/use-synthetic-recovery';
import {validOfflineEvent,type OfflineAction} from '../../../lib/offline-policy';
import {markOfflineConflict,removeOfflineEvent} from '../../../lib/offline-store';

const canCollect=(status:string)=>status==='collecting';
const isUid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
export function FieldVisitActions({assignment,couriers}:{
  assignment:FieldAssignment;couriers:{staffId:string;zone:string}[]
}){
  const router=useRouter();
  const recovery=useSyntheticRecovery();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [barcodes,setBarcodes]=useState<Record<string,string>>({});
  const [courier,setCourier]=useState('');
  const [failureCode,setFailureCode]=useState('');
  const [incidentKinds,setIncidentKinds]=useState<Record<string,string>>({});
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
      // Only minimal custody events may be stored, only after recent signed
      // synthetic authorization. Barcodes and patient/clinical fields NEVER queue.
      const match=/^\/api\/phase3\/field\/specimens\/([0-9a-f-]{36})\/events$/.exec(path);
      const candidate=match&&payload.action&&payload.eventId&&
        (payload.action==='collect'||payload.action==='package'||
          payload.action==='report_damaged')?{
          specimenId:match[1]!,eventId:payload.eventId as string,
          action:payload.action as OfflineAction,
          expectedVersion:payload.expectedVersion as number,createdAt:Date.now()
        }:null;
      if(!candidate||!validOfflineEvent(candidate)){
        setMessage('Offline: only synthetic custody event IDs and versions may be queued. Label checks, handoffs and clinical data require connectivity.');
        return;
      }
      setBusy(true);
      try{
        await recovery.save(candidate);
        pending.current.delete(operation);
        setMessage('Encrypted synthetic event saved locally. This is NOT a completed custody event. Reconnect and manually reconcile it.');
      }catch{
        setMessage('Secure offline recovery unavailable or expired. Reconnect and verify staff identity before recording work.');
      }finally{setBusy(false);}
      return;
    }
    if(!isUid(assignment.id))return;
    const specimenPath=/^\/api\/phase3\/field\/specimens\/([0-9a-f-]{36})\/events$/.exec(path);
    const existing=specimenPath&&recovery.entries.some(item=>
      item.event.specimenId===specimenPath[1]&&item.event.action===payload.action&&
      item.event.expectedVersion===payload.expectedVersion);
    if(existing){
      setMessage('A matching encrypted custody event awaits reconciliation. Review it before sending another event.');
      return;
    }
    setBusy(true);setMessage('');
    // Synthetic write-ahead: a lost response must not lose the event UUID.
    // Only a minimal custody envelope is eligible; never cache label scans.
    const candidate=specimenPath&&
      (payload.action==='collect'||payload.action==='package')?{
        specimenId:specimenPath[1]!,eventId:payload.eventId as string,
        action:payload.action as OfflineAction,
        expectedVersion:payload.expectedVersion as number,createdAt:Date.now()
      }:null;
    let durable=false;
    if(candidate&&validOfflineEvent(candidate)&&recovery.capability){
      try{
        await recovery.save(candidate);
        durable=true;
      }catch{
        // Online custody still requires the server; local recovery is optional.
      }
    }
    try{
      const response=await fetch(path,{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify(payload),
        cache:'no-store'});
      if(!response.ok){
        if(response.status===401||response.status===403){
          setBarcodes({});
          pending.current.clear();
          setMessage('Your staff session expired or your permission was revoked. Sign in again before recording work.');
          router.refresh();
          return;
        }
        if(response.status===409){
          pending.current.delete(operation);
          if(durable&&candidate&&recovery.capability){
            try{
              await markOfflineConflict(recovery.capability.scope,candidate.eventId);
              await recovery.refresh();
            }catch{/* Leave encrypted event for later manual reconciliation. */}
          }
        }
        setMessage(response.status===409 ?
          'Conflict: the visit or specimen changed. Review the latest server status before retrying.' :
          'Operation not accepted. Verify your assignment and staff session before retrying.');
        router.refresh();
        return;
      }
      pending.current.delete(operation);
      if(durable&&candidate&&recovery.capability){
        try{
          await removeOfflineEvent(recovery.capability.scope,candidate.eventId);
          await recovery.refresh();
        }catch{
          // A successful API receipt is authoritative. Replaying the same ID is safe.
          setMessage('Server accepted the event; encrypted local cleanup needs review.');
          router.refresh();
          return;
        }
      }
      if(operation.startsWith('label:')){
        const specimenId=operation.slice('label:'.length);
        setBarcodes(values=>({...values,[specimenId]:''}));
      }
      setMessage('Event accepted and recorded. Updating the assigned visit.');
      router.refresh();
    }catch{
      // A lost response leaves the SAME event ID encrypted when eligible.
      setMessage(durable?
        'Network outcome unknown. Encrypted synthetic event retained for manual reconciliation.':
        'Network outcome unknown. Keep this page open to retry using the original event ID.');
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
    });
  }
  function failVisit(){
    if(!failureCode){setMessage('Select a failure reason before ending this visit.');return;}
    const operation='assignment:fail:'+failureCode;
    return send(operation,'/api/phase3/field/assignments/'+assignment.id+'/events',{
      eventId:keyFor(operation),action:'fail',failureCode,
      expectedVersion:assignment.eventVersion
    });
  }
  function reportIncident(specimenId:string){
    const kind=incidentKinds[specimenId]??'';
    if(!kind){setMessage('Select an incident type before reporting.');return;}
    const operation='incident:'+specimenId+':'+kind;
    return send(operation,'/api/phase3/field/specimens/'+specimenId+'/incident',{
      eventId:keyFor(operation),kind
    });
  }
  function offerCourier(){
    if(!courier){setMessage('Choose an eligible receiving courier.');return;}
    const operation='handoff:'+courier;
    return send(operation,'/api/phase3/field/assignments/'+assignment.id+'/handoff-offers',{
      courierStaffId:courier,requestKey:keyFor(operation)
    });
  }
  return <section className="fisher-section" aria-labelledby="field-visit-actions">
    <h2 id="field-visit-actions" className="fisher-section-title">Record collection events</h2>
    <Notice title="Restricted synthetic field workflow" tone="warning">
      Physical collection requires approved patient identity verification, consent and clinical SOPs.
      A successful barcode check alone does not establish patient identity.
    </Notice>
    {!online&&<p role="alert">Offline: only synthetic collection and packaging events can be encrypted locally. Label checks and handoffs require connectivity.</p>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
      {assignment.status==='assigned'&&
        <button type="button" disabled={busy||!online} onClick={()=>void assignmentEvent('arrive')}>
          Mark arrived
        </button>}
      {assignment.status==='arrived'&&
        <button type="button" disabled={busy||!online}
          onClick={()=>void assignmentEvent('start_collection')}>Start collection</button>}
    </div>
    {['assigned','arrived','collecting'].includes(assignment.status)&&
      <div style={{marginBottom:20}}>
        <h3>Report an unsuccessful visit</h3>
        <label htmlFor="failure-code">Controlled reason
          <select id="failure-code" value={failureCode}
            onChange={e=>setFailureCode(e.target.value)} style={{display:'block',padding:10}}>
            <option value="">Choose reason</option>
            {['patient_unavailable','location_inaccessible','collection_not_safe',
              'staff_unavailable','other'].map(code=><option key={code} value={code}>
                {code.replaceAll('_',' ')}
              </option>)}
          </select>
        </label>
        <button type="button" disabled={!failureCode||busy||!online}
          onClick={()=>void failVisit()}>Record failed visit with audit trail</button>
      </div>}
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
            <button type="button" disabled={busy}
              onClick={()=>void specimenEvent(specimen.id,'collect',specimen.custodyVersion)}>
              Record collection
            </button>
          </div>
        </>}
        {canCollect(assignment.status)&&specimen.status==='collected'&&
          <button type="button" disabled={busy}
            onClick={()=>void specimenEvent(specimen.id,'package',specimen.custodyVersion)}>
            Record packaging
          </button>}
        {canCollect(assignment.status)&&
          <div style={{marginTop:12}}>
            <label htmlFor={'incident-kind-'+specimen.id}>Report specimen incident
              <select id={'incident-kind-'+specimen.id} value={incidentKinds[specimen.id]??''}
                onChange={event=>setIncidentKinds(old=>({...old,
                  [specimen.id]:event.target.value}))} style={{display:'block',padding:10}}>
                <option value="">Select incident type</option>
                {['broken_seal','label_problem','quantity_mismatch','collection_delay','other']
                  .map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}
              </select>
            </label>
            <button type="button" disabled={!incidentKinds[specimen.id]||busy||!online}
              onClick={()=>void reportIncident(specimen.id)}>Report and flag incident</button>
          </div>}
      </div>)}
    </div>
    {canCollect(assignment.status)&&assignment.specimens.length>0&&
      assignment.specimens.every(s=>s.status==='packaged')&&
      <section style={{marginTop:24,marginBottom:16}}>
        <h3>Offer courier handoff</h3>
        <p>Only the separately authenticated courier can acknowledge receipt.
          This offer does not advance custody.</p>
        <label htmlFor="receiving-courier">Eligible receiving courier
          <select id="receiving-courier" value={courier}
            onChange={event=>setCourier(event.target.value)}
            style={{display:'block',padding:10}}>
            <option value="">Choose receiving courier</option>
            {couriers.map(item=><option key={item.staffId} value={item.staffId}>
              {item.zone} · Courier {item.staffId.slice(0,8)}
            </option>)}
          </select>
        </label>
        {!couriers.length&&<p>No eligible courier on a matching active shift.</p>}
        <button type="button" disabled={!courier||busy||!online} onClick={()=>void offerCourier()}>
          Offer handoff — receiving courier must acknowledge
        </button>
      </section>}
    <p role="status" aria-live="polite">{message}</p>
    <p>Only minimal synthetic custody events may be encrypted for manual recovery. A queued event never establishes completed custody without an accepted API receipt.</p>
  </section>;
}
