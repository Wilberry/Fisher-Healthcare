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
