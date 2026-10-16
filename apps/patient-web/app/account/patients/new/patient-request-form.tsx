'use client';
import { useState, type FormEvent } from 'react';
export function PatientRequestForm(){
 const [name,setName]=useState(''),[relation,setRelation]=useState<'self'|'dependent'|'caregiver'>('self');
 const [dob,setDob]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [submitted,setSubmitted]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');
  try{
   const result=await fetch('/api/phase2/private/patient',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({
     displayName:name.trim(),relationship:relation,...(dob?{dateOfBirth:dob}:{})
    })});
   if(!result.ok)throw new Error(result.status===503?'Profile enrolment is not available in this environment.':'Unable to submit profile request.');
   setSubmitted(true);
  }catch(ex){setError(ex instanceof Error?ex.message:'Request unavailable');}
  finally{setBusy(false);}
 }
 if(submitted)return <div className="fisher-quiet-state" role="status">
  <h2>Profile request recorded</h2>
  <p>The profile is pending identity and relationship verification. No booking or diagnostic result permissions have been granted.</p>
  <a href="/account">Return to your account</a>
 </div>;
 return <form onSubmit={submit} className="fisher-patient-form">
  <label htmlFor="patient-name">Patient name</label>
  <input id="patient-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={160} required autoComplete="off"/>
  <label htmlFor="patient-relation">Your relationship</label>
  <select id="patient-relation" value={relation} onChange={e=>setRelation(e.target.value as 'self'|'dependent'|'caregiver')}>
   <option value="self">This is me</option><option value="dependent">My dependent</option>
   <option value="caregiver">Relative / caregiver</option>
  </select>
  <label htmlFor="patient-dob">Date of birth (optional at request stage)</label>
  <input id="patient-dob" type="date" value={dob} onChange={e=>setDob(e.target.value)}/>
  <p>No clinical history or medical documents should be submitted through this development form.</p>
  <button className="fisher-button fisher-button--primary" type="submit" disabled={busy}>{busy?'Submitting…':'Submit for verification'}</button>
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </form>;
}
