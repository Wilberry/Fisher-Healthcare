'use client';
import {useSyntheticRecovery} from '../lib/use-synthetic-recovery';
export function OfflineRecoveryPanel(){
  const queue=useSyntheticRecovery();
  return <section className="fisher-section" aria-label="Encrypted synthetic offline recovery">
    <h2 className="fisher-section-title">Offline custody recovery</h2>
    <p>Non-production synthetic training only. The encrypted device queue may contain
      specimen UUIDs but never patient names, results, login tokens or barcode scans.
      It expires after 24 hours, holds up to 25 events, and needs a current staff
      session before manual replay.</p>
    {!queue.capability?
      <p role="status">Offline queue unavailable until a verified synthetic staff session is established.</p>:
      <>
        <p role="status">{queue.entries.length} encrypted pending events.</p>
        <button type="button" disabled={queue.loading||!queue.entries.some(e=>!e.review)}
          onClick={()=>void queue.sync()}>Review and synchronize pending events</button>
        <ul>{queue.entries.map(({event,review})=><li key={event.eventId}>
          {event.action.replaceAll('_',' ')} · Specimen {event.specimenId.slice(0,8)}
          {' '}· Expected version {event.expectedVersion}
          {review?' · Conflict requires review':' · Awaiting manual sync'}
          <button type="button" disabled={queue.loading}
            onClick={()=>void queue.discard(event.eventId)}>Discard local copy</button>
        </li>)}</ul>
      </>}
    <p role="status" aria-live="polite">{queue.message}</p>
    <p>Never interpret a queued entry as confirmation of specimen collection.
      Only an accepted server receipt advances custody.</p>
  </section>;
}
