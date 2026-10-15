import { describe, expect, it } from 'vitest';
import { apiErrorSchema, bookingQuoteSchema, specimenCustodySchema } from './foundation';

const id = '123e4567-e89b-42d3-a456-426614174000';
const quote = {
  currency: 'NGN',
  serviceTier: 'regular',
  lines: [{ catalogueTestId: id, laboratoryId: id, unitPriceKobo: 850000 }],
  logisticsFeeKobo: 250000,
  totalKobo: 1100000,
  expiresAt: '2026-10-15T14:00:00+01:00'
};

describe('cross-domain contracts', () => {
  it('requires exact quote totals in NGN minor units', () => {
    expect(bookingQuoteSchema.safeParse(quote).success).toBe(true);
    expect(bookingQuoteSchema.safeParse({ ...quote, totalKobo: 1100001 }).success).toBe(false);
    expect(bookingQuoteSchema.safeParse({ ...quote, currency: 'USD' }).success).toBe(false);
  });
  it('rejects missing actor attribution on custody events', () => {
    expect(specimenCustodySchema.safeParse({
      specimenId: id, eventType: 'collected', occurredAt: '2026-10-15T14:00:00+01:00', eventId: id
    }).success).toBe(false);
  });
  it('defines a non-sensitive API error envelope', () => {
    expect(apiErrorSchema.safeParse({
      error: { code: 'REQUEST_REJECTED', message: 'Request could not be completed', requestId: 'req123' }
    }).success).toBe(true);
  });
});
