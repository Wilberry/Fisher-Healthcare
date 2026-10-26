import {staffApi} from '../../lib/staff-auth';
import {ReadinessAlertActions} from './readiness-alert-actions';
const codes=['custody_incidents','outbox_dead_letters','result_email_failures'] as const;
type Code=(typeof codes)[number];
type Alert={code:Code;status:'open'|'acknowledged'|'resolved';count:number};
function parse(rows:Record<string,unknown>[]):Alert[]{
 return rows.filter((row):row is Record<string,unknown> & {code:Code} =>
   typeof row.code==='string'&&codes.some(v=>v===row.code)&&
   (row.status==='open'||row.status==='acknowledged'||row.status==='resolved')&&
   typeof row.observed_count==='number'&&
   Number.isSafeInteger(row.observed_count)&&row.observed_count>=0)
  .map(row=>({code:row.code,status:row.status as Alert['status'],
    count:row.observed_count as number}));
}
export async function ReadinessAlerts(){
 const response=await staffApi('ops/pilot-readiness/alerts');
 if(!response.authorized){
  return <section aria-label="Synthetic readiness alerts">
   <h2>Readiness alert review</h2>
   <p>Unavailable without current administrative authorization and synthetic test mode.</p>
  </section>;
 }
 return <section aria-label="Synthetic readiness alerts">
  <h2>Readiness alert review</h2>
  <p>Only three aggregate signals are evaluated. Acknowledgment records review,
   not incident resolution or clinical authorization. No external paging occurs.</p>
  <ReadinessAlertActions alerts={parse(response.records)}/>
 </section>;
}
