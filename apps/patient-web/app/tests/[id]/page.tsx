import { Card, Notice, SiteShell } from '@fisher/ui';
import { naira, testDetail } from '../../../lib/public-api';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function TestDetail({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const item=await testDetail(id);
 const offerings=item && Array.isArray(item.offerings)?item.offerings:[];
 return <SiteShell subtitle="Test information" navigation={[
  {href:'/tests',label:'All tests'},{href:'/book',label:'Plan a booking'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <Link href="/tests">← Back to catalogue</Link>
   {!item?<Notice title="Test not available">This offering is not currently available. Return to the active test catalogue.</Notice>:
    <><p className="fisher-eyebrow">{String(item.code??'Diagnostic service')}</p>
    <h1 className="fisher-section-title">{String(item.name)}</h1>
    <p className="fisher-lead">Specimen type: {String(item.specimen_type??'Confirmed during booking')}</p>
    <Notice title="Laboratory-reviewed preparation guidance">
     {typeof item.preparation_text==='string' && item.preparation_text.length>=5?
      item.preparation_text:'Laboratory preparation guidance is being reviewed.'}
    </Notice>
    <p>Confirm instructions and collection eligibility with the clinical team before your appointment. Do not change prescribed medication without advice from your clinician.</p>
    <div className="fisher-grid fisher-collection-grid">{offerings.map((value,i)=>{
     if(!value || typeof value!=='object')return null;
     const o=value as Record<string,unknown>;
     return <Card key={i}><h2>{String(o.labName??'Lab offering')}</h2>
      <p>Test fee: {typeof o.priceKobo==='number'?naira(o.priceKobo):'To be confirmed'}</p>
      <p>Estimated processing: {String(o.turnaroundHours??'—')} hours from laboratory receipt, subject to validation.</p>
     </Card>;
    })}</div>
    <a className="fisher-button fisher-button--primary" href="/book">Plan a collection</a></>}
  </div></section>
 </SiteShell>;
}
