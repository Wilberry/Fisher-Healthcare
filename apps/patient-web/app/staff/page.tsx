import { Card,Notice,SiteShell } from '@fisher/ui';
import { readSession } from '../../lib/patient-auth';
import { patientApi } from '../../lib/patient-api';
import { CatalogCreator } from './catalog-creator';
import { StaffAction,type ActionKind } from './staff-action';
export const dynamic='force-dynamic';
function rows(response:{ok:boolean;data:unknown}):Record<string,unknown>[]{
 if(!response.ok||!response.data||typeof response.data!=='object'||!('data' in response.data)||
    !Array.isArray(response.data.data))return [];
 return response.data.data.filter((v):v is Record<string,unknown> =>
  !!v&&typeof v==='object'&&!Array.isArray(v));
}
type Queue={title:string;route:string;getAction:(item:Record<string,unknown>)=>ActionKind;
 resource?:boolean};
const queues:Queue[]=[
 {title:'Patient relationship review',route:'ops/patient-relationships/pending',getAction:()=> 'patient-approve'},
 {title:'Collection coverage review',route:'ops/patient-addresses/pending',getAction:()=> 'address-approve'},
 {title:'Catalogue activation requests',route:'ops/catalog/reviews',getAction:()=> 'catalog-approve',resource:true},
 {title:'Verified guest assisted intake',route:'ops/guest-booking/requests',getAction:()=> 'guest-assign'},
 {title:'Customer support queue',route:'ops/work-queue/support',
  getAction:r=>r.status==='assigned'?'support-resolve':'support-assign'},
 {title:'Payment exceptions (acknowledgment only)',route:'ops/work-queue/payment-exceptions',getAction:()=> 'payment-ack'}
];
export default async function StaffConsole(){
 const session=await readSession();
 const responses=session?await Promise.all(queues.map(q=>patientApi(q.route))):[];
 const permitted=responses.some(r=>r.ok);
 return <SiteShell subtitle="Synthetic internal operations" navigation={[
  {href:'/account',label:'Patient portal'},{href:'/book',label:'Booking planner'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Fisher Healthcare operations</h1>
   <Notice title="Restricted synthetic administration">Every action requires a validated staff bearer token, MFA, current database role and server-side audit. Approvals do not authorize clinical results, live charging, provider refunds or customer messaging.</Notice>
   {!session?<p><a href="/auth/login?next=%2Fstaff">Sign in using authorized staff identity</a></p>:
    !permitted?<Notice title="Staff role or MFA required">No operational queue is available to this identity. A patient session is not an operations permission.</Notice>:
    <>
     <div className="fisher-grid fisher-collection-grid">{queues.map((q,i)=>{
      if(!responses[i]?.ok)return null;
      const items=rows(responses[i]!);
      return <Card key={q.route}><h2>{q.title}</h2>
       {items.length?<ul className="fisher-record-list">{items.map((item,j)=>{
        const id=typeof item.resource_id==='string'?item.resource_id:
         typeof item.id==='string'?item.id:'';
        if(!id)return null;
        const type=typeof item.resource_type==='string'?item.resource_type:undefined;
        return <li key={id+j}><strong>{String(item.display_name??item.label??item.category??type??item.status??'Review')}</strong>
         <span>{id} · {String(item.status??'Pending')}</span>
         <StaffAction id={id} action={q.getAction(item)} resourceType={q.resource?type:undefined}/>
        </li>;
       })}</ul>:<p>No pending records for your role.</p>}
      </Card>;
     })}</div>
     {responses[2]?.ok&&<Card><h2>Create inactive synthetic catalogue record</h2>
      <CatalogCreator/></Card>}
    </>}
  </div></section>
 </SiteShell>;
}
