export type FieldAssignmentStatus =
  'assigned' | 'arrived' | 'collecting' | 'completed' | 'failed' | 'cancelled';
export type FieldAssignmentAction = 'arrive' | 'start_collection' | 'fail';
export type FieldFailureCode =
  'patient_unavailable' | 'location_inaccessible' | 'collection_not_safe' |
  'staff_unavailable' | 'other';
export const fieldFailureCodes: readonly FieldFailureCode[] = [
  'patient_unavailable','location_inaccessible','collection_not_safe','staff_unavailable','other'
];
export interface AssignmentSnapshot { status: FieldAssignmentStatus; version: number }
export interface AssignmentCommand {
  action: FieldAssignmentAction; expectedVersion: number; failureCode?: string
}
export class AssignmentConflict extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AssignmentConflict'; }
}
export function advanceAssignment(current: AssignmentSnapshot, cmd: AssignmentCommand): AssignmentSnapshot {
  if (!Number.isSafeInteger(cmd.expectedVersion) || cmd.expectedVersion < 0 ||
      cmd.expectedVersion !== current.version) throw new AssignmentConflict('STALE_ASSIGNMENT_VERSION');
  const valid = (cmd.action === 'arrive' && current.status === 'assigned') ||
    (cmd.action === 'start_collection' && current.status === 'arrived') ||
    (cmd.action === 'fail' && ['assigned','arrived','collecting'].includes(current.status));
  if (!valid) throw new AssignmentConflict('INVALID_ASSIGNMENT_TRANSITION');
  if (cmd.action === 'fail' && !fieldFailureCodes.some(code => code === cmd.failureCode)) {
    throw new AssignmentConflict('ASSIGNMENT_FAILURE_REASON_REQUIRED');
  }
  if (cmd.action !== 'fail' && cmd.failureCode !== undefined) {
    throw new AssignmentConflict('UNEXPECTED_ASSIGNMENT_FAILURE_REASON');
  }
  const next = cmd.action === 'arrive' ? 'arrived' :
    cmd.action === 'start_collection' ? 'collecting' : 'failed';
  return { status: next, version: current.version + 1 };
}
