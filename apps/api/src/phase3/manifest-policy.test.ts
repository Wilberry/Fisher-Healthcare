import { describe, expect, it } from 'vitest';
import { normalizeManifestDisposition, sameDisposition } from './manifest-policy';

describe('manifest receipt reconciliation', () => {
  const first = '00000000-0000-4000-8000-000000000001';
  const second = '00000000-0000-4000-8000-000000000002';
  it('sorts receipt members for deterministic replay', () => {
    const actual = normalizeManifestDisposition([first, second], [second, first], []);
    expect(actual).toEqual({ accepted: [first, second], rejected: [], rejectionCode: null });
    expect(sameDisposition(actual, normalizeManifestDisposition([second, first], [first, second], []))).toBe(true);
  });
  it('rejects missing, substituted and duplicate specimen IDs', () => {
    expect(() => normalizeManifestDisposition([first, second], [first], [])).toThrow('MANIFEST_RECEIPT_MISMATCH');
    expect(() => normalizeManifestDisposition([first], [second], [])).toThrow('MANIFEST_RECEIPT_MISMATCH');
    expect(() => normalizeManifestDisposition([first], [first], [first], 'other')).toThrow('MANIFEST_RECEIPT_MISMATCH');
  });
  it('requires a controlled reason for any physical rejection', () => {
    expect(() => normalizeManifestDisposition([first], [], [first])).toThrow('MANIFEST_REJECTION_REASON_REQUIRED');
    expect(normalizeManifestDisposition([first], [], [first], 'label_mismatch').rejectionCode).toBe('label_mismatch');
    expect(() => normalizeManifestDisposition([first], [first], [], 'other')).toThrow('UNEXPECTED_REJECTION_REASON');
  });
  it('detects a conflicting replay disposition', () => {
    const accepted = normalizeManifestDisposition([first], [first], []);
    const rejected = normalizeManifestDisposition([first], [], [first], 'other');
    expect(sameDisposition(accepted, rejected)).toBe(false);
  });
});
