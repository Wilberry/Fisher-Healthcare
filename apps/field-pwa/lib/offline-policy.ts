/**
 * Synthetic-only minimal custody event envelope. Never store patient names,
 * contact information, clinical results, tokens, or scanned/expected barcodes.
 */
export const offlineActions=['collect','package','report_damaged'] as const;
export type OfflineAction=typeof offlineActions[number];
export type QueuedCustodyEvent={
  specimenId:string;eventId:string;action:OfflineAction;
  expectedVersion:number;createdAt:number
};
export const OFFLINE_MAX_EVENTS=25;
export const OFFLINE_MAX_AGE_MS=24*60*60*1000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validOfflineEvent(event:unknown,now=Date.now()):event is QueuedCustodyEvent{
  if(!event||typeof event!=='object'||Array.isArray(event))return false;
  const item=event as Record<string,unknown>;
  const permitted=['specimenId','eventId','action','expectedVersion','createdAt'];
  if(Object.keys(item).length!==permitted.length||
     !Object.keys(item).every(field=>permitted.includes(field)))return false;
  return typeof item.specimenId==='string'&&uuid.test(item.specimenId)&&
    typeof item.eventId==='string'&&uuid.test(item.eventId)&&
    offlineActions.some(action=>action===item.action)&&
    typeof item.expectedVersion==='number'&&
    Number.isSafeInteger(item.expectedVersion)&&item.expectedVersion>=0&&
    typeof item.createdAt==='number'&&Number.isSafeInteger(item.createdAt)&&
    item.createdAt<=now+1000&&now-item.createdAt<OFFLINE_MAX_AGE_MS;
}
export function validOfflineScope(scope:string):boolean{
  return /^[a-f0-9]{64}$/.test(scope);
}
export function toOfflineBatch(events:readonly QueuedCustodyEvent[]){
  return {events:events.map(({specimenId,eventId,action,expectedVersion})=>
    ({specimenId,eventId,action,expectedVersion}))};
}


export function reconcileOfflineAcknowledgments(
  events:readonly QueuedCustodyEvent[],raw:unknown
):{accepted:string[];conflicted:string[]} {
  if(!Array.isArray(raw)||raw.length!==events.length)
    throw Error('Incomplete custody reconciliation');
  const expected=new Set(events.map(event=>event.eventId));
  if(expected.size!==events.length)throw Error('Duplicate submitted custody event');
  const seen=new Set<string>(),accepted:string[]=[],conflicted:string[]=[];
  for(const item of raw){
    if(!item||typeof item!=='object'||Array.isArray(item))
      throw Error('Malformed custody acknowledgment');
    const outcome=item as Record<string,unknown>;
    if(typeof outcome.eventId!=='string'||!expected.has(outcome.eventId)||
       seen.has(outcome.eventId)||typeof outcome.accepted!=='boolean')
      throw Error('Unrecognized or duplicate custody acknowledgment');
    seen.add(outcome.eventId);
    if(outcome.accepted)accepted.push(outcome.eventId);
    else conflicted.push(outcome.eventId);
  }
  if(seen.size!==expected.size)throw Error('Missing custody acknowledgment');
  return {accepted,conflicted};
}
