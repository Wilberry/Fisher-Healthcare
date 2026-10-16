'use client';
import { useState, type FormEvent } from 'react';
import type { ZonePreview } from '../../../../../../lib/public-api';
export function AddressRequestForm({patientId,patientName,zones}:{patientId:string;patientName:string;zones:ZonePreview[]}){
 const [zoneId,setZoneId]=useState(zones[0]?.id??'');
 const [label,setLabel]=useState('Synthetic address'),[line,setLine]=useState('Synthetic Street 1');
 const [locality,setLocality]=useState('Synthetic locality'),[busy,setBusy]=useState(false);
 const [done,setDone]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/phase2/private/address',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({
     patientId,zoneId,label:label.trim(),addressLine:line.trim(),locality:locality.trim()
    })});
   if(!response.ok)throw new Error('Address request could not be saved in the synthetic environment.');
   setDone(true);
  }catch(ex){setError(ex instanceof Error?ex.message:'Request failed');}
  finally{setBusy(false);}
 }
 if(done)return <div className="fisher-quiet-state" role="status"><h2>Coverage review requested</h2>
  <p>This location cannot be used for appointments until authorized staff verify coverage and record approval.</p>
  <a href="/account">Back to your account</a>
 </div>;
 return <form onSubmit={submit} className="fisher-patient-form">
  <p><strong>Patient:</strong> {patientName}</p>
  <label htmlFor="address-zone">Requested zone</label>
  <select id="address-zone" value={zoneId} onChange={e=>setZoneId(e.target.value)}>
   {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
  </select>
  <label htmlFor="address-label">Address label</label>
  <input id="address-label" minLength={2} maxLength={50} required value={label} onChange={e=>setLabel(e.target.value)}/>
  <label htmlFor="address-line">Collection street / building (synthetic only)</label>
  <input id="address-line" minLength={5} maxLength={250} required value={line} onChange={e=>setLine(e.target.value)}/>
  <label htmlFor="address-locality">Locality (synthetic only)</label>
  <input id="address-locality" minLength={2} maxLength={100} required value={locality} onChange={e=>setLocality(e.target.value)}/>
  <button type="submit" disabled={busy||!zoneId} className="fisher-button fisher-button--primary">{busy?'Submitting…':'Request coverage review'}</button>
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </form>;
}
