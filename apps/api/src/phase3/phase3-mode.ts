import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Phase 3 routes are not live services while clinical operations and signed
 * staff-browser integration await release approval. Fail CLOSED in production
 * and whenever the explicitly synthetic development mode is not enabled.
 */
export function requirePhase3SyntheticMode(): void {
  if (process.env.NODE_ENV === 'production' ||
      process.env.FISHER_PHASE3_OPERATION_MODE !== 'synthetic-only') {
    throw new ServiceUnavailableException('Phase 3 operations are not enabled');
  }
}
