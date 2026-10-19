import Link from 'next/link';
import { Notice, SiteShell } from '@fisher/ui';
import { readSession } from '../../../../lib/patient-auth';
import { PatientRequestForm } from './patient-request-form';
export const dynamic='force-dynamic';
export default async function NewPatientPage(){
 const session=await readSession();
 return <SiteShell subtitle="Family profiles" navigation={[
  {href:'/account',label:'My account'},{href:'/book',label:'Booking planner'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Request a patient profile</h1>
   <p className="fisher-lead">Patient identity and authorized booking rights must be verified independently before a booking can be made.</p>
   <Notice title="Permission is not automatic">Adding a relative or dependent does not give you permission to view results or create bookings. Fisher Healthcare must verify the appropriate authority before either action is enabled.</Notice>
   {!session?<Link href="/auth/login?next=%2Faccount%2Fpatients%2Fnew" className="fisher-button fisher-button--primary">Sign in to continue</Link>:
    <PatientRequestForm/>}
  </div></section>
 </SiteShell>;
}
