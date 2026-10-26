import Link from 'next/link';
import {Notice,SiteShell,Card} from '@fisher/ui';
import {oidcConfig,readStaffSession,verifyActiveStaff} from '../../lib/staff-auth';
import {ReadinessAlerts} from './readiness-alerts';
export const dynamic='force-dynamic';
const fields=[
 ['openCustodyIncidents','Open custody incidents'],
 ['outboxPending','Unprocessed background events'],
 ['outboxDeadLetters','Dead-letter events'],
 ['resultReleasePending','Results pending review'],
 ['resultEmailPending','Result notification queue'],
 ['resultEmailFailed','Failed result notifications'],
 ['refundReviewPending','Refunds awaiting review'],
 ['labSettlementReviewPending','Lab settlements awaiting review']
] as const;
type Key=(typeof fields)[number][0];
type Metrics=Record<Key,number>;
async function readSnapshot():Promise<{state:string;counts:Metrics|null}>{
 const session=await readStaffSession(),cfg=oidcConfig();
 if(!session)return {state:'Sign-in required',counts:null};
 if(!cfg)return {state:'Service configuration unavailable',counts:null};
 try{
  const subject=await verifyActiveStaff(session.accessToken,cfg.api);
  if(subject!==session.subject)return {state:'Staff verification expired',counts:null};
  const resp=await fetch(new URL('/api/v1/ops/pilot-readiness/snapshot',cfg.api),{
   headers:{authorization:'Bearer '+session.accessToken},
   cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  if(!resp.ok)return {state:resp.status===403?'Administrator access required':
     'Synthetic readiness unavailable',counts:null};
  const raw:unknown=await resp.json();
  if(!raw||typeof raw!=='object'||!('data' in raw)||!raw.data||
     typeof raw.data!=='object'||Array.isArray(raw.data))
     return {state:'Invalid readiness response',counts:null};
  const source=raw.data as Record<string,unknown>;
  if(source.scope!=='disposable-synthetic-only'||
     source.pilotActivationAuthorized!==false||
     source.productionReleaseAuthorized!==false||
     !source.counts||typeof source.counts!=='object'||Array.isArray(source.counts))
     return {state:'Unsafe or invalid readiness response',counts:null};
  const data=source.counts as Record<string,unknown>;
  if(fields.some(([key])=>typeof data[key]!=='number'||
     !Number.isSafeInteger(data[key])||(data[key] as number)<0))
     return {state:'Invalid metric values',counts:null};
  const counts=Object.fromEntries(fields.map(([key])=>[key,data[key]])) as Metrics;
  return {state:'Synthetic-only posture',counts};
 }catch{return {state:'Readiness service unavailable',counts:null};}
}
export default async function PilotReadiness(){
 const posture=await readSnapshot();
 return <SiteShell subtitle="Phase 5 · Internal readiness"
  navigation={[{href:'/',label:'Operations'},{href:'/dispatch',label:'Dispatch'}]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Controlled Lagos pilot · Engineering preview</p>
   <h1 className="fisher-section-title">Operational readiness</h1>
   <Notice title="Pilot activation is not authorized" tone="warning">
     This page contains aggregate synthetic measurements only. It is not
     evidence of regulatory approval, clinical sign-off, disaster recovery
     of production data, or authorization for real patient bookings.
   </Notice>
   {!posture.counts?<Notice title={posture.state}>
     No operational data are displayed without current administrator authorization,
     MFA, and an explicitly disposable test environment.
     {oidcConfig()&&<p><Link href="/auth/login?next=%2Fpilot-readiness">Staff sign in</Link></p>}
   </Notice>:<>
     <h2>Disposable operational indicators</h2>
     <div className="fisher-grid">{fields.map(([key,label])=>
       <Card key={key}><h3>{label}</h3>
        <p>{posture.counts![key].toLocaleString('en-NG')}</p>
       </Card>)}</div>
     <p>Active incidents, failed notifications and dead letters require operational investigation.
       Pending queues are not, by themselves, clinical release decisions.</p>
     <ReadinessAlerts/>
   </>}
  </div></section>
 </SiteShell>;
}
