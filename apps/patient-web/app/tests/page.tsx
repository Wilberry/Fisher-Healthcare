import Link from 'next/link';
import { Card, Notice, SiteShell } from '@fisher/ui';
import { naira, tests } from '../../lib/public-api';
export const dynamic='force-dynamic';
export default async function TestsPage({searchParams}:{searchParams:Promise<{search?:string}>}){
 const search=(await searchParams).search?.trim().slice(0,100)??'';
 const items=await tests(search);
 return <SiteShell subtitle="Available diagnostic tests" navigation={[
  {href:'/',label:'Home'},{href:'/book',label:'Plan a booking'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Diagnostic test discovery</p>
   <h1 className="fisher-section-title">Explore supported tests</h1>
   <p className="fisher-lead">Only laboratory-approved, currently enabled offerings appear here. Preparation instructions and timings must be confirmed before collection.</p>
   <form action="/tests" method="get" className="fisher-search">
    <label htmlFor="test-search">Search by test name or code</label>
    <div className="fisher-search-controls">
     <input id="test-search" name="search" maxLength={100} defaultValue={search} placeholder="Search diagnostic tests"/>
     <button type="submit" className="fisher-button fisher-button--primary">Search</button>
    </div>
   </form>
   {items.length===0?<Notice title="No active offerings available">The catalogue is being prepared. Only approved tests appear when laboratory configuration is enabled.</Notice>:
    <div className="fisher-grid fisher-collection-grid">{items.map(item=><Card key={item.id}>
     <p className="fisher-eyebrow">{item.code}</p><h2>{item.name}</h2>
     <p>Specimen: {item.specimen_type}</p>
     <p><strong>From {naira(item.starting_from_kobo)}</strong> · Laboratory fees vary</p>
     <Link className="fisher-button fisher-button--secondary" href={'/tests/'+item.id}>View offering</Link>
    </Card>)}</div>}
  </div></section>
 </SiteShell>;
}
