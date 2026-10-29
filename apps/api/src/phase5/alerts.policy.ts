/** Closed operational alert taxonomy; no patient or object identifiers. */
export const ALERT_CODES=[
 'custody_incidents','outbox_dead_letters','result_email_failures'
] as const;
export type AlertCode=(typeof ALERT_CODES)[number];
export type AlertCounts=Record<AlertCode,number>;
export type AlertStatus='open'|'acknowledged'|'resolved';
export function isAlertCode(code:unknown):code is AlertCode{
 return typeof code==='string'&&ALERT_CODES.some(v=>v===code);
}
export function validateAlertCounts(raw:Record<string,unknown>):AlertCounts{
 const counts={} as AlertCounts;
 for(const code of ALERT_CODES){
  const value=raw[code];
  if(typeof value!=='number'||!Number.isSafeInteger(value)||
     value<0||value>2147483647)
    throw new Error('Synthetic alert measurement unavailable');
  counts[code]=value;
 }
 return counts;
}
export function actionForAlert(count:number,status:AlertStatus):
 'open'|'reopen'|'resolve'|'steady'{
 if(!Number.isSafeInteger(count)||count<0)throw new Error('Invalid alert count');
 if(count===0)return status==='resolved'?'steady':'resolve';
 if(status==='resolved')return 'reopen';
 if(status==='acknowledged')return 'steady';
 return 'open';
}
