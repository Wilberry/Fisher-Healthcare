import {z} from 'zod';
export const serviceTierSchema=z.enum(['regular','premium']);
export const moneySchema=z.object({currency:z.literal('NGN'),amountKobo:z.number().int().nonnegative()});
export const quoteRequestSchema=z.object({patientId:z.string().uuid().optional(),testIds:z.array(z.string().uuid()).min(1),serviceTier:serviceTierSchema,zoneId:z.string().uuid(),slotId:z.string().uuid()}).strict();
export const bookingStatusSchema=z.enum(['draft','awaiting_payment','confirmed','assigned','collection_in_progress','collected','lab_processing','results_ready','completed','cancelled','exception']);
export type QuoteRequest=z.infer<typeof quoteRequestSchema>;
export type BookingStatus=z.infer<typeof bookingStatusSchema>;

export * from './foundation';

export * from './booking';
