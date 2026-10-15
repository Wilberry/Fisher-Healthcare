import { z } from 'zod';

const uuid = z.string().uuid();
const currency = z.literal('NGN');
const positiveKobo = z.number().int().nonnegative().max(2_147_483_647);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(['REQUEST_REJECTED', 'INTERNAL_ERROR']),
    message: z.string().min(1),
    requestId: z.string().min(1)
  }).strict()
}).strict();

export const quoteLineSchema = z.object({
  catalogueTestId: uuid,
  laboratoryId: uuid,
  unitPriceKobo: positiveKobo
}).strict();

export const bookingQuoteSchema = z.object({
  currency,
  serviceTier: z.enum(['regular', 'premium']),
  lines: z.array(quoteLineSchema).min(1),
  logisticsFeeKobo: positiveKobo,
  totalKobo: positiveKobo,
  expiresAt: z.string().datetime({ offset: true })
}).strict().superRefine((value, ctx) => {
  const expected = value.lines.reduce((sum, line) => sum + line.unitPriceKobo, value.logisticsFeeKobo);
  if (expected !== value.totalKobo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Quote amount does not reconcile', path: ['totalKobo'] });
  }
});

export const specimenCustodySchema = z.object({
  specimenId: uuid,
  actorId: uuid,
  eventType: z.enum(['collected', 'packaged', 'handed_off', 'received_by_lab', 'exception']),
  occurredAt: z.string().datetime({ offset: true }),
  eventId: uuid
}).strict();

export const resultReleaseSchema = z.object({
  resultId: uuid,
  orderId: uuid,
  patientId: uuid,
  releasingActorId: uuid,
  releasedAt: z.string().datetime({ offset: true })
}).strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
export type BookingQuote = z.infer<typeof bookingQuoteSchema>;
export type SpecimenCustody = z.infer<typeof specimenCustodySchema>;
