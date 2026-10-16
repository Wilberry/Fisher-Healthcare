import { Card, Notice, SiteShell } from '@fisher/ui';
import { patientAccountData } from '../../lib/patient-api';
import { naira } from '../../lib/public-api';
import { RevokePatient } from './revoke-patient';
export const dynamic='force-dynamic';
export default async function AccountPage(){
 const account=await patientAccountData();
 return <SiteShell subtitle="Patient and family account" navigation={[
  {href:'/',label:'Home'},{href:'/tests',label:'Diagnostic tests'},{href:'/book',label:'Plan a booking'},{href:'/support',label:'Support'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Private patient portal</p><h1 className="fisher-section-title">Your account</h1>
   {!account.signedIn?<div>
    <p className="fisher-lead">Sign in through the configured identity provider to see only the bookings and profiles you are authorized to access.</p>
    <a href="/auth/login?next=%2Faccount" className="fisher-button fisher-button--primary">Sign in securely</a>
    <Notice title="Private by design">Family booking permission never grants access to another patient&apos;s diagnostic results.</Notice>
   </div>:<>
    <form method="post" action="/auth/logout" className="fisher-logout"><button type="submit" className="fisher-button fisher-button--secondary">Sign out</button></form>
    {!account.available&&<Notice title="Account information unavailable">We could not verify the current patient data. No stored records are shown in place of server-authorized information.</Notice>}
    <div className="fisher-grid fisher-collection-grid">
     <Card><h2>Booking history</h2>
      {account.bookings.length?<ul className="fisher-record-list">{account.bookings.map(b=><li key={b.id}>
       <a href={'/account/bookings/'+b.id}>Booking {b.id.slice(0,8).toUpperCase()}</a>
       <span>{b.status.replaceAll('_',' ')} · {naira(b.total_kobo)}</span>
      </li>)}</ul>:<p>No authorized bookings are available.</p>}
     </Card>
     <Card><h2>Patient and family profiles</h2>
      {account.patients.length?<ul className="fisher-record-list">{account.patients.map(p=><li key={p.id}>
       <strong>{p.display_name}</strong>
       <span>{p.relationship} · {p.can_book&&p.verified?'Booking authorized':'Verification required'}</span>
       <RevokePatient patientId={p.id}/>
      </li>)}</ul>:<p>No profiles are currently linked to your verified account.</p>}
      <a href="/account/patients/new">Add a family profile</a>
      {account.patients.filter(p=>p.can_book&&p.verified).map(p=>
       <p key={p.id}><a href={'/account/patients/'+p.id+'/addresses/new'}>Request collection address for {p.display_name}</a></p>)}
     </Card>
     <Card><h2>Booking notifications</h2>
      {account.notifications.length?<ul className="fisher-record-list">{account.notifications.map(n=><li key={n.id}>
       <strong>{n.template.replaceAll('_',' ')}</strong><span>{n.channel} · {n.status}</span>
      </li>)}</ul>:<p>No verified delivery information is available.</p>}
     </Card>
    </div>
    <p><a href="/support" className="fisher-button fisher-button--secondary">Get booking or payment assistance</a></p>
    <Card><h2>Support history</h2>{account.supportCases.length?
     <ul className="fisher-record-list">{account.supportCases.map(s=><li key={s.id}>
      <strong>{s.category.replaceAll('_',' ')}</strong><span>{s.status} · {s.preferred_contact} preferred</span>
     </li>)}</ul>:<p>No support cases are recorded for this account.</p>}</Card>
    <Notice title="Diagnostic results">Released laboratory results will appear under separate patient-specific permissions in Phase 4. Booking access does not authorize clinical document access.</Notice>
   </>}
  </div></section>
 </SiteShell>;
}
