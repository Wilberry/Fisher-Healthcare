export type CustodyState = 'planned' | 'collected' | 'packaged' | 'in_transit' | 'lab_received' | 'accepted' | 'rejected' | 'lost' | 'damaged' | 'quarantined';
export type CustodyAction = 'collect' | 'package' | 'dispatch' | 'receive_at_lab' | 'accept' | 'reject' | 'report_lost' | 'report_damaged' | 'quarantine';
export type CustodyRole = 'collector' | 'courier' | 'lab_staff' | 'operations';
export interface CustodyCommand {
  specimenId: string;
  eventId: string;
  actorId: string;
  role: CustodyRole;
  action: CustodyAction;
  expectedVersion: number;
  recipientId?: string;
  recipientAcknowledged?: boolean;
}
export interface CustodySnapshot { state: CustodyState; version: number; }
export class CustodyConflict extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CustodyConflict'; }
}
const transitions: Record<CustodyAction, { from: CustodyState[]; to: CustodyState; roles: CustodyRole[] }> = {
  collect: { from: ['planned'], to: 'collected', roles: ['collector'] },
  package: { from: ['collected'], to: 'packaged', roles: ['collector'] },
  dispatch: { from: ['packaged'], to: 'in_transit', roles: ['collector', 'courier'] },
  receive_at_lab: { from: ['in_transit'], to: 'lab_received', roles: ['lab_staff'] },
  accept: { from: ['lab_received'], to: 'accepted', roles: ['lab_staff'] },
  reject: { from: ['lab_received'], to: 'rejected', roles: ['lab_staff'] },
  report_lost: { from: ['collected', 'packaged', 'in_transit'], to: 'lost', roles: ['courier', 'operations'] },
  report_damaged: { from: ['collected', 'packaged', 'in_transit', 'lab_received'], to: 'damaged', roles: ['collector', 'courier', 'lab_staff', 'operations'] },
  quarantine: { from: ['collected', 'packaged', 'in_transit', 'lab_received'], to: 'quarantined', roles: ['lab_staff', 'operations'] }
};
export function transitionCustody(current: CustodySnapshot, command: CustodyCommand): CustodySnapshot {
  if (!command.actorId || !command.specimenId || !command.eventId) throw new CustodyConflict('INVALID_IDENTITY');
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== current.version) throw new CustodyConflict('STALE_VERSION');
  const rule = transitions[command.action];
  if (!rule) throw new CustodyConflict('INVALID_ACTION');
  if (!rule.roles.includes(command.role)) throw new CustodyConflict('FORBIDDEN_ACTOR');
  if (!rule.from.includes(current.state)) throw new CustodyConflict('INVALID_TRANSITION');
  if (command.action === 'dispatch') {
    if (!command.recipientId || command.recipientId === command.actorId || command.recipientAcknowledged !== true)
      throw new CustodyConflict('HANDOFF_NOT_ACKNOWLEDGED');
  }
  if (command.action === 'receive_at_lab') {
    // Only the authenticated manifest handler may construct this acknowledgment.
    if (command.recipientId !== command.actorId || command.recipientAcknowledged !== true)
      throw new CustodyConflict('HANDOFF_NOT_ACKNOWLEDGED');
  }
  return { state: rule.to, version: current.version + 1 };
}
