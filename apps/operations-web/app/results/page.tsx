import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
import {ResultActions} from './result-actions';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export default async function ResultOperations(){
 const [queue,intake]=await Promise.all([
   staffApi('ops/results/pending'),staffApi('ops/results/intake-readiness')
 ]);
 const authorized=queue.authorized||intake.authorized;
 const pending=queue.records.filter(row=>typeof row.id==='string'&&uuid.test(row.id))
   .map(row=>({id:row.id as string}));
 return <SiteShell subtitle="Operations · Laboratory results"
   navigation={[{href:'/',label:'Operations'},{href:'/lab-manifests',label:'Manifests'}]}>
  <section className="fisher-section"><div className="fisher-container">
    <p className="fisher-eyebrow">Phase 4 · Synthetic-only clinical workflow</p>
    <h1 className="fisher-section-title">Result intake and independent release</h1>
    {!authorized?<Notice title="Staff authorization required" tone="warning">
      Only verified result-release staff may access the review queue.
      {oidcConfig()&&<p><Link href="/auth/login?next=%2Fresults">Staff sign in</Link></p>}
    </Notice>:<>
      <Notice title="Synthetic development only">These operations cannot be used for real patient results.
        Secure file upload, clinical report verification and real document delivery require separate integration approval.</Notice>
      {queue.authorized&&<><h2>Awaiting result-release review</h2>
        {!pending.length?<p>No results awaiting release.</p>:
          <ul>{pending.map(item=><li key={item.id}>{item.id}</li>)}</ul>}</>}
      <ResultActions pending={pending} canIntake={intake.authorized} canRelease={queue.authorized}/>
    </>}
    <p><Link href="/">Return to operations</Link></p>
  </div></section>
 </SiteShell>;
}
