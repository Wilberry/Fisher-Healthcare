/** Only aggregates; a snapshot cannot certify clinical, legal or operational sign-off. */
export const POSTURE_KEYS=[
 'openCustodyIncidents','outboxPending','outboxDeadLetters',
 'resultReleasePending','resultEmailPending','resultEmailFailed',
 'refundReviewPending','labSettlementReviewPending'
] as const;
export type PostureKey=(typeof POSTURE_KEYS)[number];
export type PostureCounts=Record<PostureKey,number>;
export function classifyOperationalPosture(raw:Record<string,unknown>){
 const counts={} as PostureCounts;
 for(const key of POSTURE_KEYS){
  const value=raw[key];
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)
   throw new Error('Operational posture measurement unavailable');
  counts[key]=value;
 }
 const attention=counts.openCustodyIncidents>0||
  counts.outboxDeadLetters>0||counts.resultEmailFailed>0;
 return {
  scope:'disposable-synthetic-only' as const,
  operationalState:attention?'attention_required' as const:'observed' as const,
  counts,
  clinicalSignoffRecorded:false as const,
  privacySignoffRecorded:false as const,
  productionReleaseAuthorized:false as const,
  pilotActivationAuthorized:false as const
 };
}
