'use client';
import {useEffect} from 'react';

/** Prevent another open operations tab from displaying stale grant data. */
export function StaffSessionBoundary({children}:{children:React.ReactNode}){
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel('fisher-phase3-operations-session');
    channel.onmessage=event=>{
      if(event.data==='signed-out'&&window.location.pathname!=='/signed-out')
        window.location.replace('/signed-out');
    };
    return ()=>channel.close();
  },[]);
  return <>{children}</>;
}
