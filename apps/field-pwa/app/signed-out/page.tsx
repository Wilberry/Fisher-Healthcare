'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {clearOfflineRecovery} from '../../lib/offline-store';
export default function StaffSignedOut(){
  const [state,setState]=useState('Clearing encrypted synthetic recovery data from this browser…');
  useEffect(()=>{
    let active=true;
    void clearOfflineRecovery().then(()=>{
      if(active)setState('Signed out. Local synthetic custody recovery data cleared.');
    }).catch(()=>{
      if(active)setState('Signed out. Close other Fisher tabs and clear site data before sharing this device; encrypted recovery cleanup was blocked.');
    });
    return ()=>{active=false;};
  },[]);
  return <main style={{maxWidth:720,margin:'4rem auto',padding:24}}>
    <h1>Field staff signed out</h1>
    <p role="status" aria-live="polite">{state}</p>
    <p>No locally queued event counts as completed custody until the API accepts it.</p>
    <Link href="/visits">Return to field sign-in</Link>
  </main>;
}
