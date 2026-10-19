'use client';
import {useCallback,useEffect,useState} from 'react';
import {
  readOfflineQueue,saveOfflineEvent,markOfflineConflict,
  removeOfflineEvent,type RecoveryEntry
} from './offline-store';
import {toOfflineBatch,reconcileOfflineAcknowledgments,type QueuedCustodyEvent,validOfflineScope} from './offline-policy';

export type OfflineCapability={scope:string;checkedAt:number};
export async function fetchOfflineCapability():Promise<OfflineCapability|null>{
  const response=await fetch('/api/phase3/field/offline/context',{
    method:'GET',credentials:'same-origin',cache:'no-store'
  });
  if(!response.ok)return null;
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||!('scope' in raw)||
     typeof raw.scope!=='string'||!validOfflineScope(raw.scope))return null;
  return {scope:raw.scope,checkedAt:Date.now()};
}
export function useSyntheticRecovery(){
  const [capability,setCapability]=useState<OfflineCapability|null>(null);
  const [entries,setEntries]=useState<RecoveryEntry[]>([]);
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{
    if(typeof navigator!=='undefined'&&!navigator.onLine)return;
    try{
      const current=await fetchOfflineCapability();
      setCapability(current);
      if(current)setEntries(await readOfflineQueue(current.scope));
      else {setEntries([]);setMessage('Sign in with current field permissions to review pending events.');}
    }catch{setMessage('Encrypted recovery storage is unavailable on this device.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const onOnline=()=>{void refresh();};
    window.addEventListener('online',onOnline);
    return ()=>window.removeEventListener('online',onOnline);
  },[refresh]);
  // Offline event creation can only continue briefly after an online,
  // verified staff session. Backend still rejects revoked/stale events.
  const save=useCallback(async(event:QueuedCustodyEvent)=>{
    if(!capability||Date.now()-capability.checkedAt>10*60*1000)
      throw Error('Reconnect and revalidate your staff session before queueing work');
    await saveOfflineEvent(capability.scope,event);
    setEntries(await readOfflineQueue(capability.scope));
  },[capability]);
  const sync=useCallback(async()=>{
    if(typeof navigator!=='undefined'&&!navigator.onLine){
      setMessage('Reconnect before reviewing pending work.');return;
    }
    setLoading(true);setMessage('');
    try{
      const current=await fetchOfflineCapability();
      setCapability(current);
      if(!current){setEntries([]);setMessage('Staff session expired or access revoked. Sign in again.');return;}
      const all=await readOfflineQueue(current.scope);
      const ready=all.filter(item=>!item.review).slice(0,25);
      if(!ready.length){
        setEntries(all);setMessage('No eligible pending events. Review conflicts or discard them.');return;
      }
      const response=await fetch('/api/phase3/field/events/sync',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(toOfflineBatch(ready.map(item=>item.event)))
      });
      if(!response.ok){
        setMessage(response.status===401||response.status===403?
          'Staff authorization is no longer valid. Reauthenticate before recovery.':
          'Recovery service unavailable. Pending encrypted events were retained.');
        return;
      }
      const payload:unknown=await response.json();
      if(!payload||typeof payload!=='object'||!('data' in payload)||
         !payload.data||typeof payload.data!=='object'||!('outcomes' in payload.data)||
         !Array.isArray(payload.data.outcomes))
        throw Error('Invalid recovery response');
      const plan=reconcileOfflineAcknowledgments(
        ready.map(item=>item.event),payload.data.outcomes);
      for(const id of plan.accepted)await removeOfflineEvent(current.scope,id);
      for(const id of plan.conflicted)await markOfflineConflict(current.scope,id);
      const updated=await readOfflineQueue(current.scope);
      setEntries(updated);
      setMessage(updated.some(x=>x.review)?
        'Some events conflict with current custody and need manual review. They were not retried.':
        'Accepted events reconciled; any unresolved events remain encrypted.');
    }catch{
      setMessage('Recovery response unknown. Events remain queued with original IDs for safe retry.');
    }finally{setLoading(false);}
  },[]);
  const discard=useCallback(async(id:string)=>{
    if(!capability||typeof navigator!=='undefined'&&!navigator.onLine)return;
    try{
      const current=await fetchOfflineCapability();
      if(!current||current.scope!==capability.scope)throw Error('Staff identity changed');
      await removeOfflineEvent(current.scope,id);
      setEntries(await readOfflineQueue(current.scope));
      setMessage('Local event discarded. This does not undo any server-side custody record.');
    }catch{setMessage('Cannot discard without current matching staff authorization.');}
  },[capability]);
  return {capability,entries,save,sync,discard,refresh,loading,message};
}
