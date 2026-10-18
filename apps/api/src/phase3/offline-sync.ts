import type { CustodySnapshot, CustodyCommand } from './custody';
import { CustodyConflict, transitionCustody } from './custody';
export interface OfflineEvent { command: CustodyCommand; createdAt: string; }
export type OfflineOutcome = { eventId: string; accepted: boolean; state?: CustodySnapshot; code?: string };
/**
 * Deterministic reconciliation policy used by offline clients and integration tests.
 * This is not a replacement for the database-backed transactional event receiver.
 */
export function reconcileOfflineEvents(
  initial: CustodySnapshot,
  events: readonly OfflineEvent[],
  known: Map<string, { fingerprint: string; outcome: OfflineOutcome }>
): { state: CustodySnapshot; outcomes: OfflineOutcome[] } {
  let state = initial;
  const outcomes: OfflineOutcome[] = [];
  for (const event of events) {
    const { command } = event;
    const fingerprint = JSON.stringify([
      command.specimenId, command.actorId, command.role, command.action,
      command.expectedVersion, command.recipientId ?? null, command.recipientAcknowledged ?? false
    ]);
    const previous = known.get(command.eventId);
    if (previous) {
      outcomes.push(previous.fingerprint === fingerprint ? previous.outcome :
        { eventId: command.eventId, accepted: false, code: 'EVENT_ID_REUSED' });
      continue;
    }
    let outcome: OfflineOutcome;
    try {
      const next = transitionCustody(state, command);
      state = next;
      outcome = { eventId: command.eventId, accepted: true, state: next };
    } catch (error) {
      outcome = { eventId: command.eventId, accepted: false,
        code: error instanceof CustodyConflict ? error.code : 'INVALID_EVENT' };
    }
    known.set(command.eventId, { fingerprint, outcome });
    outcomes.push(outcome);
  }
  return { state, outcomes };
}
