'use client';
import { useMemo, useState } from 'react';
type Queue = { id: string; zone: string; tier: string; status: string; window: string };
const examples: readonly Queue[] = [
  { id:'SYN-DSP-001',zone:'Synthetic mainland',tier:'Regular',status:'Ready',window:'Training slot A' },
  { id:'SYN-DSP-002',zone:'Synthetic island',tier:'Premium',status:'Assigned',window:'Training slot B' },
  { id:'SYN-DSP-003',zone:'Synthetic mainland',tier:'Regular',status:'Review',window:'Training slot C' }
];
export default function DispatchWorkbench({ demo }: { demo: boolean }) {
  const [filter,setFilter] = useState('All');
  const [query,setQuery] = useState('');
  const visible = useMemo(() => examples.filter(item =>
    (filter === 'All' || item.status === filter) &&
    (item.id.toLowerCase().includes(query.toLowerCase()) ||
     item.zone.toLowerCase().includes(query.toLowerCase()))), [filter,query]);
  return <section className="fisher-section" aria-labelledby="phase3-dispatch-title">
    <h2 id="phase3-dispatch-title" className="fisher-section-title">Dispatch queue</h2>
    {!demo ? <p role="status">No dispatch records are loaded. An authenticated staff session is required.</p> :
      <>
        <p role="status">Synthetic sample records — no real patients, bookings, couriers or payments.</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:18}}>
          <label>Filter by state
            <select value={filter} onChange={event=>setFilter(event.target.value)} style={{display:'block',padding:10}}>
              {['All','Ready','Assigned','Review'].map(state=><option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label>Search synthetic work items
            <input value={query} onChange={event=>setQuery(event.target.value)}
              placeholder="ID or service area" style={{display:'block',padding:10}}/>
          </label>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <caption style={{textAlign:'left',marginBottom:8}}>Synthetic dispatch records for UI review</caption>
            <thead><tr>{['Reference','Service area','Service tier','Collection window','State'].map(v=>
              <th scope="col" key={v} style={{textAlign:'left',padding:12,borderBottom:'1px solid currentColor'}}>{v}</th>)}</tr></thead>
            <tbody>{visible.map(v=><tr key={v.id}>
              <th scope="row" style={{padding:12,textAlign:'left'}}>{v.id}</th>
              <td style={{padding:12}}>{v.zone}</td><td style={{padding:12}}>{v.tier}</td>
              <td style={{padding:12}}>{v.window}</td><td style={{padding:12}}>{v.status}</td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <p role="status">No synthetic work items match these filters.</p>}
        </div>
        <p style={{marginTop:16}}>This preview contains no assignment or incident action buttons. Mutations remain API-authorized.</p>
      </>}
  </section>;
}
