'use client';
import { useState } from 'react';

const steps = [
  'Check allocated assignment',
  'Verify synthetic specimen label',
  'Record collection checklist',
  'Prepare specimen packaging',
  'Offer courier handoff',
  'Confirm authenticated courier receipt'
] as const;
export default function FieldTrainingWorkbench({ demo }: { demo: boolean }) {
  const [completed, setCompleted] = useState<number[]>([]);
  return <section className="fisher-section" aria-labelledby="training-checklist">
    <h2 id="training-checklist" className="fisher-section-title">Collection checklist</h2>
    {!demo ? <p role="status">Checklist is locked pending signed field staff identity.</p> :
      <>
        <p role="status">Synthetic-only training checklist. No operational event is saved or transmitted.</p>
        <ol>{steps.map((step,index)=><li key={step} style={{marginBottom:12}}>
          <label><input type="checkbox" checked={completed.includes(index)}
            onChange={event=>setCompleted(old=>event.target.checked ?
              [...old,index] : old.filter(item=>item!==index))}/>
            <span style={{marginLeft:10}}>{step}</span>
          </label>
        </li>)}</ol>
        <p aria-live="polite">{completed.length} of {steps.length} training steps selected</p>
        <button type="button" onClick={()=>setCompleted([])}>Clear training selections</button>
        <p style={{marginTop:12}}>Real field events require a current signed assignment, a unique event ID,
          server-checked specimen version and separate receiving-party acknowledgment.</p>
      </>}
  </section>;
}
