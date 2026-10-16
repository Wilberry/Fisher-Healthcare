import { describe, expect, it } from 'vitest';
import { serializeOperationalRecord, type OperationalRecord } from './index';

describe('safe structured operational logging', () => {
  it('serializes allowlisted fields without PHI or arbitrary metadata', () => {
    const record = {
      service: 'worker',
      level: 'error',
      event: 'worker.iteration_failed',
      patientName: 'DO_NOT_LOG_PATIENT',
      clinicalResult: 'DO_NOT_LOG_RESULT'
    } as OperationalRecord;
    const serialized = serializeOperationalRecord(record, new Date('2026-10-16T00:00:00.000Z'));
    expect(serialized).toContain('worker.iteration_failed');
    expect(serialized).not.toContain('DO_NOT_LOG_PATIENT');
    expect(serialized).not.toContain('DO_NOT_LOG_RESULT');
    expect(JSON.parse(serialized)).toEqual({
      timestamp: '2026-10-16T00:00:00.000Z',
      service: 'worker',
      level: 'error',
      event: 'worker.iteration_failed'
    });
  });
  it('drops potentially sensitive or malformed correlation IDs', () => {
    const serialized = serializeOperationalRecord({
      service: 'api',
      level: 'warn',
      event: 'api.startup_failed',
      requestId: 'patient@example.com'
    });
    expect(serialized).not.toContain('patient@example.com');
  });
});
