import { describe, expect, it } from 'vitest';
import { reconcileOfflineEvents } from './offline-sync';
import type { CustodyCommand } from './custody';
const command: CustodyCommand = {
  specimenId: 'specimen', eventId: 'evt1', actorId: 'worker',
  role: 'collector', action: 'collect', expectedVersion: 0
};
describe('offline event reconciliation', () => {
  it('replays an identical event without incrementing custody version', () => {
    const known = new Map();
    const first = reconcileOfflineEvents({ state: 'planned', version: 0 }, [{ command, createdAt: '2026-01-01T00:00:00Z' }], known);
    const second = reconcileOfflineEvents(first.state, [{ command, createdAt: '2026-01-01T00:00:00Z' }], known);
    expect(first.state.version).toBe(1);
    expect(second.state.version).toBe(1);
    expect(second.outcomes[0]?.accepted).toBe(true);
  });
  it('rejects conflicting reuse of an event identity', () => {
    const known = new Map();
    reconcileOfflineEvents({ state: 'planned', version: 0 }, [{ command, createdAt: '' }], known);
    const result = reconcileOfflineEvents({ state: 'collected', version: 1 },
      [{ command: { ...command, action: 'package' }, createdAt: '' }], known);
    expect(result.outcomes[0]?.code).toBe('EVENT_ID_REUSED');
  });
  it('rejects out-of-order events rather than silently rebasing them', () => {
    const result = reconcileOfflineEvents({ state: 'planned', version: 0 },
      [{ command: { ...command, expectedVersion: 2 }, createdAt: '' }], new Map());
    expect(result.outcomes[0]?.code).toBe('STALE_VERSION');
  });
});
