import { CustodyConflict } from './custody';

// "Accepted" here means physically received at the laboratory handoff,
// never clinically accepted for analysis or released as a patient result.
export const receiptRejectionCodes = [
  'label_mismatch', 'leakage', 'temperature_excursion', 'damaged_container',
  'quantity_mismatch', 'other'
] as const;
export type ReceiptRejectionCode = typeof receiptRejectionCodes[number];

export interface ManifestDisposition {
  accepted: string[];
  rejected: string[];
  rejectionCode: ReceiptRejectionCode | null;
}

export function normalizeManifestDisposition(
  expected: readonly string[], accepted: readonly string[], rejected: readonly string[],
  rejectionCode?: string
): ManifestDisposition {
  const all = [...accepted, ...rejected];
  if (expected.length === 0 || expected.length > 100 || all.length !== expected.length ||
      new Set(expected).size !== expected.length || new Set(all).size !== all.length ||
      !all.every(id => expected.includes(id))) {
    throw new CustodyConflict('MANIFEST_RECEIPT_MISMATCH');
  }
  if (rejected.length > 0 && !receiptRejectionCodes.some(code => code === rejectionCode)) {
    throw new CustodyConflict('MANIFEST_REJECTION_REASON_REQUIRED');
  }
  if (rejected.length === 0 && rejectionCode !== undefined) {
    throw new CustodyConflict('UNEXPECTED_REJECTION_REASON');
  }
  return {
    accepted: [...accepted].sort(),
    rejected: [...rejected].sort(),
    rejectionCode: rejected.length ? rejectionCode as ReceiptRejectionCode : null
  };
}
export function sameDisposition(a: ManifestDisposition, b: ManifestDisposition): boolean {
  return a.rejectionCode === b.rejectionCode &&
    JSON.stringify(a.accepted) === JSON.stringify(b.accepted) &&
    JSON.stringify(a.rejected) === JSON.stringify(b.rejected);
}
