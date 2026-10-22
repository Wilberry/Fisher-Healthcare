import Link from 'next/link';
import {Notice,SiteShell,Card} from '@fisher/ui';
import {readSession} from '../../../../lib/patient-auth';
import {patientApi} from '../../../../lib/patient-api';
export const dynamic='force-dynamic';
type Detail={id:string;releasedAt:string;testName:string;documentAccess:string};
function parseDetail(raw:unknown):Detail|null{
  if(!raw||typeof raw!=='object'||!('data' in raw))return null;
  const candidate=raw.data;
  if(!candidate||typeof candidate!=='object')return null;
  const value=candidate as Record<string,unknown>;
  if(typeof value.id!=='string'||typeof value.releasedAt!=='string'||
    typeof value.testName!=='string'||typeof value.documentAccess!=='string')return null;
  return {id:value.id,releasedAt:value.releasedAt,
    testName:value.testName,documentAccess:value.documentAccess};
}
export default async function ResultDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
  const session=await readSession();
  const response=session&&valid?await patientApi('results/'+id):null;
  const detail=response?.ok?parseDetail(response.data):null;
  return <SiteShell subtitle="Private result details" navigation={[{href:'/account/results',label:'Result history'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <Link href="/account/results">← Result history</Link>
      <h1 className="fisher-section-title">Laboratory result</h1>
      {!session?<Notice title="Sign-in required">Please sign in to see authorized records.</Notice>:
       !detail?<Notice title="Result unavailable">This result is not released or your current account does not have permission to view it.</Notice>:
        <Card>
          <h2>{detail.testName}</h2>
          <p>Released {new Date(detail.releasedAt).toLocaleDateString('en-NG')}</p>
          {detail.documentAccess==='synthetic_document_available'?
           <p><a download href={'/api/phase4/results/'+detail.id+'/download'}>
             Download verified synthetic PDF (testing only)</a></p>:
           <Notice title="Secure document pending">Clinical report delivery requires separate private-storage and release validation. Your released result metadata is accessible above.</Notice>}
        </Card>}
    </div></section>
  </SiteShell>;
}
