import Link from 'next/link';
import {Notice,SiteShell,Card} from '@fisher/ui';
import {patientAccountData,patientApi} from '../../../lib/patient-api';
import {ResultEmailPreference} from './result-email-preference';
export const dynamic='force-dynamic';
type Result={id:string;released_at:string;test_name:string;test_id:string};
function parseResults(raw:unknown):Result[]{
  if(!raw||typeof raw!=='object'||!('data' in raw)||
     !Array.isArray(raw.data))return [];
  return raw.data.filter((item:unknown):item is Result=>{
    if(!item||typeof item!=='object')return false;
    const value=item as Record<string,unknown>;
    return typeof value.id==='string'&&typeof value.released_at==='string'&&
      typeof value.test_name==='string'&&typeof value.test_id==='string';
  });
}
export default async function PatientResults(){
  const account=await patientAccountData();
  // Private server-side calls use the existing sealed patient session.
  // A booking relationship alone is not sufficient: the API independently
  // checks can_view_results and audits authorized result history access.
  const profiles=account.signedIn&&account.available?account.patients.slice(0,20):[];
  const history=await Promise.all(profiles.map(async patient=>{
    const [reply,mail]=await Promise.all([
      patientApi('patients/'+patient.id+'/results'),
      patientApi('patients/'+patient.id+'/result-email-preference')
    ]);
    const preference=mail.ok&&mail.data&&typeof mail.data==='object'&&
      'data' in mail.data&&mail.data.data&&typeof mail.data.data==='object'&&
      'emailEnabled' in mail.data.data&&typeof mail.data.data.emailEnabled==='boolean'
      ?mail.data.data.emailEnabled:null;
    return {patient,authorized:reply.ok,results:reply.ok?parseResults(reply.data):[],preference};
  }));
  return <SiteShell subtitle="Private laboratory results" navigation={[
    {href:'/account',label:'My account'},{href:'/',label:'Home'}
  ]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Confidential patient records</p>
      <h1 className="fisher-section-title">Your laboratory result history</h1>
      {!account.signedIn?
        <Notice title="Sign-in required">Sign in to access patient-specific results.
          <p><Link href="/auth/login?next=%2Faccount%2Fresults">Sign in securely</Link></p>
        </Notice>:
        !account.available?
        <Notice title="Result history unavailable">Your account could not be verified. No clinical information is displayed.</Notice>:
        <div className="fisher-grid">
          {history.map(({patient,authorized,results})=>
            <Card key={patient.id}>
              <h2>{patient.display_name}</h2>
              {authorized&&preference!==null&&
                <ResultEmailPreference patientId={patient.id} initiallyEnabled={preference}/>}
              {!authorized?
                <p>Results are unavailable or you do not have current result-viewing permission for this profile.</p>:
                results.length?<ul className="fisher-record-list">
                  {results.map(result=><li key={result.id}>
                    <Link href={'/account/results/'+result.id}>{result.test_name}</Link>
                    <span>Released {new Date(result.released_at).toLocaleDateString('en-NG')}</span>
                  </li>)}
                </ul>:<p>No released results are available for this patient.</p>}
            </Card>)}
          {!history.length&&<Notice title="No verified profiles">No patient profiles are currently available to this account.</Notice>}
        </div>}
      <p>Result access is separate from booking authority. Only released, authorized metadata is shown. Secure document access and email delivery are not yet active.</p>
    </div></section>
  </SiteShell>;
}
