import {describe,expect,it} from 'vitest';
import {OFFLINE_MAX_AGE_MS,OFFLINE_MAX_EVENTS,toOfflineBatch,
  validOfflineEvent,validOfflineScope} from './offline-policy';
const id='00000000-0000-4000-8000-000000000001';
const key='00000000-0000-4000-8000-000000000002';
describe('restricted synthetic custody recovery envelopes',()=>{
  const now=Date.now();
  const fixture={specimenId:id,eventId:key,action:'collect',expectedVersion:0,createdAt:now};
  it('permits only bounded, versioned custody identifiers with event IDs',()=>{
    expect(validOfflineEvent(fixture,now)).toBe(true);
    expect(validOfflineEvent({...fixture,action:'dispatch'},now)).toBe(false);
    expect(validOfflineEvent({...fixture,action:'receive_at_lab'},now)).toBe(false);
    expect(validOfflineEvent({...fixture,expectedVersion:-1},now)).toBe(false);
    expect(validOfflineEvent({...fixture,createdAt:now-OFFLINE_MAX_AGE_MS},now)).toBe(false);
    expect(OFFLINE_MAX_EVENTS).toBe(25);
  });
  it('drops extraneous medical or credential fields before network replay',()=>{
    const batch=toOfflineBatch([{...fixture,patientName:'synthetic name',
      observedBarcode:'do-not-save',accessToken:'not-allowed'} as never]);
    const serialized=JSON.stringify(batch);
    expect(serialized).not.toContain('patientName');
    expect(serialized).not.toContain('observedBarcode');
    expect(serialized).not.toContain('accessToken');
    expect(serialized).toContain(key);
  });
  it('accepts only opaque staff-scoped 256-bit digests',()=>{
    expect(validOfflineScope('a'.repeat(64))).toBe(true);
    expect(validOfflineScope('synthetic-user')).toBe(false);
    expect(validOfflineScope('A'.repeat(64))).toBe(false);
  });
});
