import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {oidcConfig,staffManifestDetail} from '../../../lib/staff-auth';
import {ReceiveManifest} from './receive-manifest';
export const dynamic='force-dynamic';
export default async function ManifestDetails({params}:{
  params:Promise<{id:string}>
}){
  const {id}=await params;
  const detail=await staffManifestDetail(id);
  const status=typeof detail.manifest?.status==='string'?detail.manifest.status:'';
  return <SiteShell subtitle="Operations · Laboratory receipt"
    navigation={[{href:'/lab-manifests',label:'All manifests'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <h1 className="fisher-section-title">Manifest receipt</h1>
      {!detail.authorized||!detail.manifest?
        <Notice title="Lab manifest access denied" tone="warning">
          A current laboratory grant or dispatcher capability is required.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Flab-manifests">Staff sign in</Link></p>}
        </Notice>:
        <>
          <p>Manifest {id.slice(0,8)} · {status}</p>
          <p>This view contains no patient identity, specimen barcode or diagnostic results.</p>
          <ReceiveManifest id={id} status={status} specimens={detail.specimens}/>
        </>}
      <p><Link href="/lab-manifests">All manifests</Link></p>
    </div></section>
  </SiteShell>;
}
