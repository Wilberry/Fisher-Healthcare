import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const bookingQuoteInput = z.object({
  zoneId: uuidSchema, slotId: uuidSchema, labId: uuidSchema,
  serviceTier: z.enum(['regular', 'premium']),
  testIds: z.array(uuidSchema).min(1).max(30).refine(v => new Set(v).size === v.length, 'Duplicate test')
}).strict();
export const bookingDraftInput = z.object({ quoteId: uuidSchema, patientId: uuidSchema }).strict();
export const bookingHoldInput = z.object({ draftId: uuidSchema }).strict();
export const bookingCommitInput = z.object({ draftId: uuidSchema }).strict();
export const checkoutInput = z.object({ bookingId: uuidSchema }).strict();
export type BookingQuoteInput = z.infer<typeof bookingQuoteInput>;
export type BookingDraftInput = z.infer<typeof bookingDraftInput>;
export type BookingHoldInput = z.infer<typeof bookingHoldInput>;
export type BookingCommitInput = z.infer<typeof bookingCommitInput>;
export type CheckoutInput = z.infer<typeof checkoutInput>;

export type QuoteItem = Readonly<{ testId: string; name: string; priceKobo: number }>;
export function quoteTotals(prices: readonly number[], logisticsFeeKobo: number) {
  if (prices.length === 0 || prices.some(p => !Number.isSafeInteger(p) || p < 0) ||
      !Number.isSafeInteger(logisticsFeeKobo) || logisticsFeeKobo < 0) {
    throw new Error('Invalid quotation prices');
  }
  const testsTotalKobo = prices.reduce((a,b) => a+b,0);
  const totalKobo = testsTotalKobo + logisticsFeeKobo;
  if (!Number.isSafeInteger(totalKobo) || totalKobo > 2147483647) {
    throw new Error('Quotation exceeds supported payment limit');
  }
  return { testsTotalKobo, logisticsFeeKobo, totalKobo, currency: 'NGN' as const };
}

export const createPatientSchema = z.object({
 displayName: z.string().trim().min(2).max(160),
 relationship: z.enum(['self','dependent','caregiver']),
 dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict();
export type CreatePatient = z.infer<typeof createPatientSchema>;
