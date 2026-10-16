/**
 * Closed operational logging schema: no arbitrary event data, headers, user IDs,
 * specimen identifiers, result content or other personal information.
 */
export type OperationalService = 'api' | 'worker';
export type OperationalLevel = 'info' | 'warn' | 'error';
export type OperationalEvent =
  | 'api.started'
  | 'api.startup_failed'
  | 'worker.disabled'
  | 'worker.started'
  | 'worker.iteration_failed'
  | 'worker.startup_failed'
  | 'worker.stopped';

export interface OperationalRecord {
  service: OperationalService;
  level: OperationalLevel;
  event: OperationalEvent;
  requestId?: string;
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,72}$/;

export function serializeOperationalRecord(
  record: OperationalRecord,
  timestamp: Date = new Date()
): string {
  const safe = {
    timestamp: timestamp.toISOString(),
    service: record.service,
    level: record.level,
    event: record.event,
    ...(typeof record.requestId === 'string' && REQUEST_ID.test(record.requestId)
      ? { requestId: record.requestId } : {})
  };
  return JSON.stringify(safe);
}

export function writeOperationalRecord(record: OperationalRecord): void {
  const output = serializeOperationalRecord(record);
  if (record.level === 'error') process.stderr.write(output + '\n');
  else process.stdout.write(output + '\n');
}
