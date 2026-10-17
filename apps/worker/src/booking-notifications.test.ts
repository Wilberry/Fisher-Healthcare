import { describe, expect, it, vi } from 'vitest';
import { bookingEventHandlers } from './booking-notifications';
import type { Pool } from 'pg';
const orderId='00000000-0000-4000-8000-000000000001';
const paymentId='00000000-0000-4000-8000-000000000002';
describe('durable notification intent handoff',()=>{
 it('persists an intent without claiming email delivery',async()=>{
  const query=vi.fn(async()=>({rowCount:1,rows:[{id:orderId}]}));
  const pool={query} as unknown as Pool;
  const handler=bookingEventHandlers(pool)['booking.confirmed']!;
  await handler({orderId,paymentId});
  expect(query).toHaveBeenCalledTimes(1);
  expect(String(query.mock.calls[0]![0])).toContain("'pending'");
  expect(String(query.mock.calls[0]![0])).not.toContain("'sent'");
 });
 it('rejects malformed event identifiers before touching storage',async()=>{
  const query=vi.fn();
  const handler=bookingEventHandlers({query} as unknown as Pool)['booking.confirmed']!;
  await expect(handler({orderId:'not-an-id',paymentId})).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
 });
});
