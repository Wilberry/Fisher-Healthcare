import Link from 'next/link';
import { Card, Notice, SiteShell } from '@fisher/ui';
import { staffAssignmentDetail,oidcConfig } from '../../../lib/staff-auth';
import { FieldVisitActions } from './visit-actions';
export const dynamic='force-dynamic';

export default async function VisitDetails({params}:{
  params:Promise<{id:string}>
}){
  const {id}=await params;
  const result=await staffAssignmentDetail(id);
  return <SiteShell subtitle="Assigned field visit" navigation={[
    {href:'/',label:'Home'},{href:'/visits',label:'My assignments'}
  ]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Field custody</p>
      <h1 className="fisher-section-title">Collection visit</h1>
      {!result.authorized||!result.assignment ?
        <>
          <Notice title="Assignment access unavailable" tone="warning">
            We cannot verify that this visit is currently assigned to your staff identity.
            No specimen or patient records have been displayed.
          </Notice>
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Fvisits">Staff sign in</Link></p>}
          <p><Link href="/visits">Return to my assignments</Link></p>
        </> :
        <>
          <Card>
            <h2>Assignment {result.assignment.id.slice(0,8)}</h2>
            <p>Status: {result.assignment.status.replaceAll('_',' ')} · Collection window:
              {' '}{result.assignment.collectionWindowStart||'Not specified'}</p>
            <p>Identifiers and custody events only. Patient contact details and laboratory results are not exposed.</p>
          </Card>
          <FieldVisitActions assignment={result.assignment}/>
        </>}
    </div></section>
  </SiteShell>;
}
