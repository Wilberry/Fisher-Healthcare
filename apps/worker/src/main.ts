import { Pool } from 'pg';
import { processOne } from './outbox';

async function main(): Promise<void> {
  // Default remains disabled until an explicitly provisioned worker is deployed.
  if (process.env.FISHER_WORKER_ENABLED !== 'true') {
    console.info('Fisher worker disabled; set FISHER_WORKER_ENABLED=true in an isolated configured environment.');
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for durable work');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let running = true;
  const stop = () => { running = false; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (running) {
      try {
        const handled = await processOne(pool);
        if (!handled) await new Promise(resolve => setTimeout(resolve, 1200));
      } catch {
        // Operational telemetry must not contain database exception details or patient payloads.
        console.error('Worker iteration failed; retrying');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  } finally {
    await pool.end();
  }
}

void main().catch(() => {
  console.error('Worker startup failed');
  process.exitCode = 1;
});
