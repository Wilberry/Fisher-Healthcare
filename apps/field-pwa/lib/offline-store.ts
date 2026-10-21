import {
  OFFLINE_MAX_EVENTS,validOfflineEvent,validOfflineScope,
  type QueuedCustodyEvent
} from './offline-policy';

const NAME='fisher_phase3_synthetic_custody_v1';
const aad=(owner:string,id:string)=>new TextEncoder().encode(owner+':'+id);
async function fingerprint(owner:string,event:QueuedCustodyEvent):Promise<string>{
  // Opaque duplicate key; never persist cleartext action/specimen identifiers
  // outside of the encrypted envelope.
  const bytes=new TextEncoder().encode(JSON.stringify([
    owner,event.specimenId,event.action,event.expectedVersion
  ]));
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
const STORE='events';
const KEY_STORE='keys';
type SealedRecord={
  id:string;owner:string;createdAt:number;iv:ArrayBuffer;
  ciphertext:ArrayBuffer;review:boolean;aadVersion?:1;fingerprint?:string
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
    const r=indexedDB.open(NAME,2);
    r.onupgradeneeded=()=>{
      const db=r.result;
      const events=db.objectStoreNames.contains(STORE)?
        r.transaction!.objectStore(STORE):db.createObjectStore(STORE,{keyPath:'id'});
      if(!events.indexNames.contains('owner_fingerprint'))
        events.createIndex('owner_fingerprint',['owner','fingerprint'],{unique:true});
      if(!db.objectStoreNames.contains(KEY_STORE))
        db.createObjectStore(KEY_STORE);
    };
    r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
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
    // An unhandled IndexedDB request error aborts its transaction; the
    // onabort handler below rejects. Do not hide failed abort operations.
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
async function writeNew(db:IDBDatabase,record:SealedRecord):Promise<void>{
  // Atomic capacity and event-ID collision checks across simultaneous tabs.
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    const existing=store.get(record.id);
    existing.onsuccess=()=>{
      if(existing.result){tx.abort();return;}
      const count=store.count();
      count.onsuccess=()=>{
        if(count.result>=OFFLINE_MAX_EVENTS){tx.abort();return;}
        store.add(record);
      };
    };
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(new Error('Recovery queue changed or is full'));
    tx.onerror=()=>reject(tx.error??new Error('Recovery write failed'));
  });
}
async function mutate(db:IDBDatabase,owner:string,eventId:string,review:boolean):Promise<void>{
  // Avoid read-then-write races that could resurrect a reconciled event.
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  const done=completed(tx),pending=store.get(eventId);
  pending.onsuccess=()=>{
    const record=pending.result as SealedRecord|undefined;
    if(record?.owner!==owner)return;
    if(review)store.put({...record,review:true});
    else store.delete(eventId);
  };
  await done;
}
async function ensureFingerprint(
  db:IDBDatabase,owner:string,id:string,value:string
):Promise<void>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  const done=completed(tx),pending=store.get(id);
  pending.onsuccess=()=>{
    const record=pending.result as SealedRecord|undefined;
    if(!record||record.owner!==owner){tx.abort();return;}
    if(!record.fingerprint)store.put({...record,fingerprint:value});
    else if(record.fingerprint!==value)tx.abort();
  };
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
        {name:'AES-GCM',iv:record.iv,
          ...(record.aadVersion===1?{additionalData:aad(record.owner,record.id)}:{})},
        secret,record.ciphertext);
      const raw:unknown=JSON.parse(new TextDecoder().decode(plaintext));
      if(!validOfflineEvent(raw)||record.id!==(raw as QueuedCustodyEvent).eventId){
        await erase(db,record.id);continue;
      }
      const digest=await fingerprint(owner,raw);
      if(record.fingerprint&&record.fingerprint!==digest){
        await erase(db,record.id);continue;
      }
      // Upgrade legacy encrypted records without losing valid pending events.
      // A unique index discards duplicate semantic work during migration.
      if(!record.fingerprint)await ensureFingerprint(db,owner,record.id,digest);
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
    const sameId=pending.find(item=>item.event.eventId===event.eventId);
    if(sameId){
      if(sameId.event.specimenId===event.specimenId&&
         sameId.event.action===event.action&&
         sameId.event.expectedVersion===event.expectedVersion)return;
      throw Error('Custody event ID was reused for a different operation');
    }
    if(pending.some(item=>item.event.specimenId===event.specimenId&&
        item.event.action===event.action&&item.event.expectedVersion===event.expectedVersion))
      throw Error('Matching event already awaits reconciliation');
    if(pending.length>=OFFLINE_MAX_EVENTS)
      throw Error('Recovery queue is full; reconnect to reconcile');
    const secret=await key(db);
    const iv=new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(iv));
    const plaintext=new TextEncoder().encode(JSON.stringify(minimal));
    const ciphertext=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:aad(owner,event.eventId)},secret,plaintext);
    await writeNew(db,{id:event.eventId,owner,createdAt:event.createdAt,
      iv,ciphertext,review:false,aadVersion:1,fingerprint:await fingerprint(owner,event)});
  }finally{db.close();}
}
export async function markOfflineConflict(owner:string,eventId:string):Promise<void>{
  if(!validOfflineScope(owner))throw Error('Fresh staff authentication required');
  const db=await open();
  try{await mutate(db,owner,eventId,true);}finally{db.close();}
}
export async function removeOfflineEvent(owner:string,eventId:string):Promise<void>{
  if(!validOfflineScope(owner))throw Error('Fresh staff authentication required');
  const db=await open();
  try{await mutate(db,owner,eventId,false);}finally{db.close();}
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
