import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Phase 3 operational methods are synthetic-only and unavailable in production.
 * This protects accidental deployment against any non-disposable database URL;
 * the actual fisher_test identity is also queried by the local verifier.
 */
export function requirePhase3SyntheticMode(): void {
  const deny = () => { throw new ServiceUnavailableException('Phase 3 operations are not enabled'); };
  if (process.env.NODE_ENV === 'production' ||
      process.env.FISHER_PHASE3_OPERATION_MODE !== 'synthetic-only' ||
      process.env.FISHER_DISPOSABLE_DB_ACK !== 'disposable-test-only' ||
      !process.env.DATABASE_URL) {
    deny();
  }
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL!);
  } catch {
    return deny();
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/fisher_test') {
    deny();
  }
}
