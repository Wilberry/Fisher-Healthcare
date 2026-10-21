'use client';
import {useEffect} from 'react';
import Link from 'next/link';

export default function OperationsSignedOut(){
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel('fisher-phase3-operations-session');
    channel.postMessage('signed-out');
    channel.close();
  },[]);
  return <main style={{maxWidth:720,margin:'4rem auto',padding:24}}>
    <h1>Operations staff signed out</h1>
    <p>Your browser session was cleared. Reauthenticate with MFA before using protected operations.</p>
    <Link href="/auth/login">Staff sign in</Link>
  </main>;
}
