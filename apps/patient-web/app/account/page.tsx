import { Card, Notice, SiteShell } from '@fisher/ui';
export default function AccountPage(){
 return <SiteShell subtitle="Patient and family account" navigation={[
  {href:'/',label:'Home'},{href:'/tests',label:'Diagnostic tests'},{href:'/book',label:'Plan a booking'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Patient portal</p><h1 className="fisher-section-title">Your account</h1>
   <p className="fisher-lead">Your bookings, authorized family members and, after laboratory release, secure diagnostic results will be managed in one account.</p>
   <Notice title="Sign-in integration pending">No patient details, appointments or results are shown before a verified identity session is established. This page contains no simulated clinical records.</Notice>
   <div className="fisher-grid fisher-collection-grid">
    <Card><h2>Booking history</h2><p>Only bookings you are authorized to manage will appear here after sign-in.</p></Card>
    <Card><h2>Family profiles</h2><p>Managing an appointment for someone else does not automatically permit access to their test results.</p></Card>
    <Card><h2>Released results</h2><p>Results will appear only following laboratory validation, approval for release and patient-specific authorization.</p></Card>
   </div>
  </div></section>
 </SiteShell>;
}
