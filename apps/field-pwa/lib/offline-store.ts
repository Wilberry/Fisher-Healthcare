import {
  OFFLINE_MAX_EVENTS,validOfflineEvent,validOfflineScope,
  type QueuedCustodyEvent
} from './offline-policy';

const NAME='fisher_phase3_synthetic_custody_v1';
const STORE='events';
const KEY_STORE='keys';
type SealedRecord={
  id:string;owner:string;createdAt:number;iv:Uint8Array;
  ciphertext:ArrayBuffer;review:boolean
};
export type RecoveryEntry={event:QueuedCustodyEvent;review:boolean};
function supported(){
  return typeof indexedDB!=='undefined'&&
    typeof crypto!=='undefined'&&!!crypto.subtle&&
    (typeof window==='undefined'||window.isSecureContext);
}
function request<T>(r:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error??new Error('Local storage unavailable'));
  });
}
function completed(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error??new Error('Local transaction aborted'));
    tx.onerror=()=>reject(tx.error??new Error('Local transaction failed'));
  });
}
async function open():Promise<IDBDatabase>{
  if(!supported())throw Error('Protected local storage is unavailable');
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(NAME,1);
    r.onupgradeneeded=()=>{
      const db=r.result;
      if(!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE,{keyPath:'id'});
      if(!db.objectStoreNames.contains(KEY_STORE))
        db.createObjectStore(KEY_STORE);
    };
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error??new Error('Cannot open encrypted queue'));
    r.onblocked=()=>reject(new Error('Local queue is locked by another tab'));
  });
}
async function key(db:IDBDatabase):Promise<CryptoKey>{
  // Generate outside the transaction; read/conditional write are serialized
  // inside a single write transaction to avoid cross-tab key replacement.
  const candidate=await crypto.subtle.generateKey(
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(KEY_STORE,'readwrite');
    const store=tx.objectStore(KEY_STORE);
    let selected:CryptoKey=candidate;
    const result=store.get('origin-key');
    result.onsuccess=()=>{
      if(result.result){
        selected=result.result as CryptoKey;
      }else{
        store.put(candidate,'origin-key');
      }
    };
    result.onerror=()=>{try{tx.abort();}catch{}};
    tx.oncomplete=()=>resolve(selected);
    tx.onerror=()=>reject(tx.error??new Error('Encryption key storage failed'));
    tx.onabort=()=>reject(tx.error??new Error('Encryption key transaction aborted'));
  });
}
async function rows(db:IDBDatabase):Promise<SealedRecord[]>{
  return request(db.transaction(STORE,'readonly').objectStore(STORE).getAll());
}
async function erase(db:IDBDatabase,id:string):Promise<void>{
  const tx=db.transaction(STORE,'readwrite');
  const done=completed(tx);
  tx.objectStore(STORE).delete(id);
  await done;
}
async function write(db:IDBDatabase,record:SealedRecord):Promise<void>{
  const tx=db.transaction(STORE,'readwrite');
  const done=completed(tx);
  tx.objectStore(STORE).put(record);
  await done;
}
async function readAll(db:IDBDatabase,owner:string):Promise<RecoveryEntry[]>{
  const secret=await key(db);
  const all=await rows(db);
  const result:RecoveryEntry[]=[];
  for(const record of all){
    if(record.owner!==owner){await erase(db,record.id);continue;}
    try{
      const plaintext=await crypto.subtle.decrypt(
        {name:'AES-GCM',iv:record.iv},secret,record.ciphertext);
      const raw:unknown=JSON.parse(new TextDecoder().decode(plaintext));
      if(!validOfflineEvent(raw)||record.id!==(raw as QueuedCustodyEvent).eventId){
        await erase(db,record.id);continue;
      }
      result.push({event:raw,review:record.review===true});
    }catch{
      // Discard corrupt/unreadable records rather than expose or submit them.
      await erase(db,record.id);
    }
  }
  return result.sort((a,b)=>a.event.createdAt-b.event.createdAt);
}
export async function readOfflineQueue(owner:string):Promise<RecoveryEntry[]>{
  if(!validOfflineScope(owner))throw Error('Fresh verified staff identity required');
  const db=await open();
  try{return await readAll(db,owner);}finally{db.close();}
}
export async function saveOfflineEvent(owner:string,event:QueuedCustodyEvent):Promise<void>{
  if(!validOfflineScope(owner)||!validOfflineEvent(event))
    throw Error('Invalid synthetic-only recovery event');
  // No scanned barcode, patient name, diagnostic result or access token can
  // enter this serialized envelope.
  const minimal={specimenId:event.specimenId,eventId:event.eventId,
    action:event.action,expectedVersion:event.expectedVersion,createdAt:event.createdAt};
  const db=await open();
  try{
    const pending=await readAll(db,owner);
    if(pending.some(item=>item.event.eventId===event.eventId))return;
    if(pending.length>=OFFLINE_MAX_EVENTS)
      throw Error('Recovery queue is full; reconnect to reconcile');
    const secret=await key(db);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plaintext=new TextEncoder().encode(JSON.stringify(minimal));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},secret,plaintext);
    await write(db,{id:event.eventId,owner,createdAt:event.createdAt,
      iv,ciphertext,review:false});
  }finally{db.close();}
}
export async function markOfflineConflict(owner:string,eventId:string):Promise<void>{
  if(!validOfflineScope(owner))throw Error('Fresh staff authentication required');
  const db=await open();
  try{
    const record=await request<SealedRecord|undefined>(
      db.transaction(STORE,'readonly').objectStore(STORE).get(eventId));
    if(record?.owner===owner)await write(db,{...record,review:true});
  }finally{db.close();}
}
export async function removeOfflineEvent(owner:string,eventId:string):Promise<void>{
  if(!validOfflineScope(owner))throw Error('Fresh staff authentication required');
  const db=await open();
  try{
    const record=await request<SealedRecord|undefined>(
      db.transaction(STORE,'readonly').objectStore(STORE).get(eventId));
    if(record?.owner===owner)await erase(db,eventId);
  }finally{db.close();}
}
export async function clearOfflineRecovery():Promise<void>{
  if(typeof indexedDB==='undefined')return;
  await new Promise<void>((resolve,reject)=>{
    const r=indexedDB.deleteDatabase(NAME);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error??new Error('Cannot clear local queue'));
    r.onblocked=()=>reject(new Error('Close other Fisher tabs to clear pending events'));
  });
}
