'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
type Type='test'|'laboratory'|'zone'|'offering'|'slot';
const fields:Record<Type,{name:string;label:string;type?:string}[]>={
 test:[
  {name:'code',label:'Short test code (A–Z, 0–9, _, -)'},
  {name:'name',label:'Reviewed test name'},
  {name:'specimenType',label:'Specimen type: blood / urine / saliva / stool / swab / other'},
  {name:'preparationText',label:'Reviewed preparation guidance (synthetic only)'}
 ],
 laboratory:[{name:'name',label:'Laboratory name'}],
 zone:[
  {name:'code',label:'Zone code'},{name:'name',label:'Zone name'},
  {name:'regularFeeKobo',label:'Regular logistics fee in kobo',type:'number'},
  {name:'premiumFeeKobo',label:'Premium logistics fee in kobo',type:'number'}
 ],
 offering:[
  {name:'labId',label:'Approved laboratory UUID'},{name:'testId',label:'Approved test UUID'},
  {name:'priceKobo',label:'Test price in kobo',type:'number'},
  {name:'turnaroundHours',label:'Turnaround hours',type:'number'}
 ],
 slot:[
  {name:'zoneId',label:'Approved zone UUID'},{name:'labId',label:'Approved laboratory UUID'},
  {name:'tier',label:'Collection tier: regular / premium'},
  {name:'startsAt',label:'Start ISO timestamp, with timezone'},
  {name:'endsAt',label:'End ISO timestamp, with timezone'},
  {name:'cutoffAt',label:'Booking cutoff ISO timestamp'},
  {name:'capacity',label:'Capacity',type:'number'}
 ]
};
export function CatalogCreator(){
 const router=useRouter(),[type,setType]=useState<Type>('test');
 const [values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage('');
  const mapped:Record<string,string|number>={};
  for(const field of fields[type]){
   const value=values[field.name]?.trim()??'';
   mapped[field.name]=field.type==='number'?Number(value):value;
  }
  try{
   const r=await fetch('/api/phase2/staff/catalog-create',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({resourceType:type,values:mapped})});
   if(!r.ok)throw Error();
   setMessage('Synthetic catalogue request saved for a different reviewer. It is not active.');
   setValues({});router.refresh();
  }catch{setMessage('Could not create this synthetic record. Check staff MFA and required fields.');}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="fisher-patient-form">
  <label htmlFor="catalog-type">Draft catalogue resource</label>
  <select id="catalog-type" value={type} onChange={e=>{setType(e.target.value as Type);setValues({});setMessage('');}}>
   {Object.keys(fields).map(t=><option key={t} value={t}>{t}</option>)}
  </select>
  {fields[type].map(f=><label key={f.name}>{f.label}
   <input required type={f.type??'text'} value={values[f.name]??''}
    onChange={e=>setValues(v=>({...v,[f.name]:e.target.value}))}/>
  </label>)}
  <button type="submit" className="fisher-button fisher-button--primary" disabled={busy}>
   {busy?'Creating…':'Submit inactive draft for separate approval'}
  </button>
  {message&&<p role="status">{message}</p>}
 </form>;
}
