import Link from 'next/link';
import {SiteShell,Notice} from '@fisher/ui';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
import {PrepareManifest} from './prepare-manifest';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
export default async function LabManifests(){
  const manifests=await staffApi('ops/lab-manifests');
  return <SiteShell subtitle="Operations · Lab handoff"
    navigation={[{href:'/dispatch',label:'Dispatch'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Internal laboratory custody</p>
      <h1 className="fisher-section-title">Laboratory manifests</h1>
      {!manifests.authorized?
        <Notice title="Authorized staff required" tone="warning">
          Lab manifests are available only to approved dispatchers or lab-scoped coordinators.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Flab-manifests">Staff sign in</Link></p>}
        </Notice>:
        <>
          <p>Manifest details include only specimen references and custody states.
            Neither patient contacts nor diagnostic results are loaded.</p>
          <ul>{manifests.records.filter(item=>typeof item.id==='string'&&uuid.test(item.id)).map(item=>{
            const id=item.id as string;
            const status=typeof item.status==='string'?item.status:'unknown';
            const count=typeof item.specimen_count==='number'?item.specimen_count:0;
            return <li key={id} style={{marginBottom:14}}>
              <Link href={'/lab-manifests/'+id}>Manifest {id.slice(0,8)}</Link>
              {' '}· {status} · {count} specimens
            </li>;
          })}</ul>
          <PrepareManifest/>
        </>}
      <p><Link href="/dispatch">Return to dispatch</Link></p>
    </div></section>
  </SiteShell>;
}
