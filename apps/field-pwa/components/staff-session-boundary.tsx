'use client';
import {useEffect} from 'react';

/** Redirect stale field tabs after a verified same-origin sign-out. */
export function StaffSessionBoundary({children}:{children:React.ReactNode}){
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel('fisher-phase3-synthetic-recovery');
    channel.onmessage=event=>{
      if(event.data==='signed-out'&&window.location.pathname!=='/signed-out')
        window.location.replace('/signed-out');
    };
    return ()=>channel.close();
  },[]);
  return <>{children}</>;
}
