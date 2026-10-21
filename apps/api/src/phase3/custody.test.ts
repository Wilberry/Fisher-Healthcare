import { describe, expect, it } from 'vitest';
import { transitionCustody, type CustodyCommand } from './custody';
const base: CustodyCommand = { specimenId: 'specimen', eventId: 'event', actorId: 'collector', role: 'collector', action: 'collect', expectedVersion: 0 };
describe('custody transition policy', () => {
  it('permits a collector to collect a planned specimen', () => {
    expect(transitionCustody({ state: 'planned', version: 0 }, base)).toEqual({ state: 'collected', version: 1 });
  });
  it('rejects a stale event', () => {
    expect(() => transitionCustody({ state: 'planned', version: 1 }, base)).toThrowError('STALE_VERSION');
  });
  it('rejects unauthorized role', () => {
    expect(() => transitionCustody({ state: 'planned', version: 0 }, { ...base, role: 'courier' })).toThrowError('FORBIDDEN_ACTOR');
  });
  it('requires receiving acknowledgement for dispatch', () => {
    expect(() => transitionCustody({ state: 'packaged', version: 2 }, { ...base, action: 'dispatch', expectedVersion: 2 })).toThrowError('HANDOFF_NOT_ACKNOWLEDGED');
  });
  it('rejects self-handoff', () => {
    expect(() => transitionCustody({ state: 'packaged', version: 2 }, { ...base, action: 'dispatch', expectedVersion: 2, recipientId: 'collector', recipientAcknowledged: true })).toThrowError('HANDOFF_NOT_ACKNOWLEDGED');
  });
  it('acknowledges receipt only for the authenticated lab receiver', () => {
    const command = { ...base, role: 'lab_staff' as const, action: 'receive_at_lab' as const,
      actorId: 'lab-user', recipientId: 'lab-user', recipientAcknowledged: true, expectedVersion: 3 };
    expect(transitionCustody({ state: 'in_transit', version: 3 }, command)).toEqual({ state: 'lab_received', version: 4 });
    expect(() => transitionCustody({ state: 'in_transit', version: 3 },
      { ...command, recipientId: 'another-user' })).toThrowError('HANDOFF_NOT_ACKNOWLEDGED');
  });
  it('does not permit accepted specimens to be collected again', () => {
    expect(() => transitionCustody({ state: 'accepted', version: 7 }, { ...base, expectedVersion: 7 })).toThrowError('INVALID_TRANSITION');
  });
  it('allows lab acceptance only after receipt', () => {
    expect(transitionCustody({ state: 'lab_received', version: 4 }, { ...base, action: 'accept', role: 'lab_staff', expectedVersion: 4 })).toEqual({ state: 'accepted', version: 5 });
  });
});
