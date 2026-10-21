import { writeOperationalRecord } from '@fisher/observability';
import { Pool } from 'pg';
import { processOne } from './outbox';
import { bookingEventHandlers, supportCaseHandlers, guestBookingHandlers } from './booking-notifications';
import { dispatchNotification } from './notification-delivery';
import { dispatchResultEmail } from './result-delivery';

async function main(): Promise<void> {
  // Default remains disabled until an explicitly provisioned worker is deployed.
  if (process.env.FISHER_WORKER_ENABLED !== 'true') {
    writeOperationalRecord({ service: 'worker', level: 'info', event: 'worker.disabled' });
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for durable work');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  writeOperationalRecord({ service: 'worker', level: 'info', event: 'worker.started' });
  let running = true;
  const stop = () => { running = false; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (running) {
      try {
        const handled = await processOne(pool, {...bookingEventHandlers(pool),...supportCaseHandlers(pool),...guestBookingHandlers(pool)});
        const mailed=await dispatchNotification(pool);
        const resultMailed=await dispatchResultEmail(pool);
        if (!handled && !mailed && !resultMailed) await new Promise(resolve => setTimeout(resolve, 1200));
      } catch {
        // Operational telemetry must not contain database exception details or patient payloads.
        writeOperationalRecord({ service: 'worker', level: 'error', event: 'worker.iteration_failed' });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  } finally {
    await pool.end();
    writeOperationalRecord({ service: 'worker', level: 'info', event: 'worker.stopped' });
  }
}

void main().catch(() => {
  writeOperationalRecord({ service: 'worker', level: 'error', event: 'worker.startup_failed' });
  process.exitCode = 1;
});
