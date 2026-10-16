'use client';
import { useState } from 'react';
import type { LabPreview, ZonePreview, TestPreview, SlotPreview, QuotedPrice } from '../../lib/public-api';
import { naira } from '../../lib/public-api';
type Props={tests:TestPreview[];labs:LabPreview[];zones:ZonePreview[]};
async function post<T>(route:string,data:unknown):Promise<T>{
 const r=await fetch(route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 if(!r.ok)throw new Error(r.status===409?'The selected slot or test is no longer available. Please select another.':'This request could not be completed.');
 return await r.json() as T;
}
export function BookingPlanner({tests,labs,zones}:Props){
 const [labId,setLabId]=useState(labs[0]?.id??'');
 const [zoneId,setZoneId]=useState(zones[0]?.id??'');
 const [tier,setTier]=useState<'regular'|'premium'>('regular');
 const [selected,setSelected]=useState<string[]>([]);
 const [slots,setSlots]=useState<SlotPreview[]>([]);
 const [slotId,setSlotId]=useState('');
 const [quote,setQuote]=useState<QuotedPrice|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const refresh=()=>{setSlots([]);setSlotId('');setQuote(null);setError('');};
 async function availability(){
  setBusy(true);setError('');setQuote(null);
  try{
   const r=await post<{data:SlotPreview[]}>('/api/phase2/availability',{labId,zoneId,serviceTier:tier});
   setSlots(r.data);setSlotId('');
  }catch(e){setError(e instanceof Error?e.message:'Service unavailable');}
  finally{setBusy(false);}
 }
 async function createQuote(){
  setBusy(true);setError('');setQuote(null);
  try{
   const q=await post<QuotedPrice>('/api/phase2/quotes',{
    labId,zoneId,slotId,serviceTier:tier,testIds:selected
   });setQuote(q);
  }catch(e){setError(e instanceof Error?e.message:'Quotation unavailable');}
  finally{setBusy(false);}
 }
 return <div className="fisher-booking-planner">
  <fieldset><legend>1. Select diagnostic tests</legend>
   <div className="fisher-test-choice">{tests.map(test=><label key={test.id}>
    <input type="checkbox" checked={selected.includes(test.id)} onChange={e=>{
     setSelected(current=>e.target.checked?[...current,test.id]:current.filter(id=>id!==test.id));refresh();
    }}/>
    <span>{test.name}<small> From {naira(test.starting_from_kobo)} · per-lab quote follows</small></span>
   </label>)}</div>
  </fieldset>
  <fieldset><legend>2. Location, laboratory and collection service</legend>
   <div className="fisher-booking-controls">
    <label>Service zone<select value={zoneId} onChange={e=>{setZoneId(e.target.value);refresh();}}>
     {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
    <label>Laboratory<select value={labId} onChange={e=>{setLabId(e.target.value);refresh();}}>
     {labs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label>Collection tier<select value={tier} onChange={e=>{setTier(e.target.value as 'regular'|'premium');refresh();}}>
     <option value="regular">Regular</option><option value="premium">Premium</option>
    </select></label>
   </div>
   <button className="fisher-button fisher-button--secondary" type="button" disabled={!labId||!zoneId||busy}
    onClick={availability}>{busy?'Checking…':'Find collection windows'}</button>
  </fieldset>
  <fieldset><legend>3. Choose a live collection window</legend>
   {!slots.length?<p>No reservable windows are currently displayed. Use the availability search above.</p>:
    <div className="fisher-test-choice">{slots.map(slot=><label key={slot.id}>
     <input type="radio" name="slot" value={slot.id} checked={slotId===slot.id}
      onChange={()=>{setSlotId(slot.id);setQuote(null);}}/>
     <span>{new Date(slot.startsAt).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'})}
      <small>{slot.remaining} place(s) remaining at last check</small></span>
    </label>)}</div>}
   <button type="button" className="fisher-button fisher-button--primary"
    disabled={busy||!slotId||!selected.length} onClick={createQuote}>{busy?'Working…':'Request a price quotation'}</button>
  </fieldset>
  {error && <p role="alert" className="fisher-planner-error">{error}</p>}
  {quote && <section aria-live="polite" className="fisher-quote">
   <h2>Your provisional quotation</h2>
   <dl><div><dt>Tests</dt><dd>{naira(quote.testsTotalKobo)}</dd></div>
    <div><dt>Collection</dt><dd>{naira(quote.logisticsFeeKobo)}</dd></div>
    <div><dt>Total</dt><dd><strong>{naira(quote.totalKobo)}</strong></dd></div></dl>
   <p>Valid until {new Date(quote.expiresAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})} (Lagos time), unless the slot fills first.</p>
   <p>To reserve a slot, sign in and confirm current authorization for the patient. This service is in synthetic development only.</p>
   <a className="fisher-button fisher-button--primary" href={'/book/confirm?quoteId='+encodeURIComponent(quote.quoteId)}>Continue with verified patient</a>
   <p><a href={'/book/guest?quoteId='+encodeURIComponent(quote.quoteId)}>Continue as a guest with email verification (assisted request)</a></p>
  </section>}
 </div>;
}
