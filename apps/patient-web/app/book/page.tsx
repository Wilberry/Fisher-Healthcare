import { Notice, SiteShell } from '@fisher/ui';
import { labs, tests, zones } from '../../lib/public-api';
import { BookingPlanner } from './planner';
export const dynamic='force-dynamic';
export default async function BookPage(){
 const [offered,partners,areas]=await Promise.all([tests(),labs(),zones()]);
 return <SiteShell subtitle="Collection planning" navigation={[
  {href:'/',label:'Home'},{href:'/tests',label:'Test catalogue'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Collection booking</p><h1 className="fisher-section-title">Plan your diagnostic collection</h1>
   <p className="fisher-lead">Compare available laboratory offerings and Regular or Premium collection windows. A quotation is not a confirmed appointment.</p>
   <Notice title="Development preview">The Lagos service is not accepting live bookings or collecting payments. Only specifically enabled synthetic staging capacity can be explored.</Notice>
   {offered.length&&partners.length&&areas.length?
     <BookingPlanner tests={offered} labs={partners} zones={areas}/>:
     <div className="fisher-quiet-state"><h2>Booking options are being prepared</h2><p>Approved tests, laboratories, service zones and collection capacity must be configured before appointment planning opens.</p>
      <a href="/tests" className="fisher-button fisher-button--secondary">Explore the test catalogue</a></div>}
  </div></section>
 </SiteShell>;
}
