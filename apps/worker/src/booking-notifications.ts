import type { Pool } from 'pg';
import type { OutboxHandler } from './outbox';

function identifiers(payload:unknown):{orderId:string;paymentId:string}{
 if(!payload || typeof payload!=='object')throw new Error('Missing notification identifiers');
 const p=payload as Record<string,unknown>;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof p.orderId!=='string' || typeof p.paymentId!=='string' ||
    !uuid.test(p.orderId) || !uuid.test(p.paymentId))throw new Error('Invalid event identifiers');
 return {orderId:p.orderId,paymentId:p.paymentId};
}
export function bookingEventHandlers(pool:Pool):Readonly<Record<string,OutboxHandler>>{
 return {
  'foundation.ping':async()=>{},
  'booking.confirmed':async payload=>{
   const {orderId}=identifiers(payload);
   const row=await pool.query(`INSERT INTO notification_intents(order_id,channel,template,status)
    SELECT id,'email','booking_confirmed','pending' FROM orders
    WHERE id=$1 AND status='confirmed'
    ON CONFLICT(order_id,channel,template) DO NOTHING RETURNING id`,[orderId]);
   if(row.rowCount===0){
    const prior=await pool.query(`SELECT 1 FROM notification_intents n JOIN orders o ON o.id=n.order_id
      WHERE n.order_id=$1 AND o.status='confirmed' AND n.channel='email' AND n.template='booking_confirmed'`,[orderId]);
    if(!prior.rows.length)throw new Error('No confirmed order for notification intent');
   }
  },
  'payment.manual_review':async payload=>{
   const {orderId,paymentId}=identifiers(payload);
   const row=await pool.query(`INSERT INTO payment_review_alerts(order_id,payment_id,reason)
    SELECT $1::uuid,p.id,'late_or_ineligible_payment' FROM payments p
    WHERE p.id=$2::uuid AND p.order_id=$1::uuid AND p.status='paid'
    ON CONFLICT(payment_id) DO NOTHING RETURNING id`,[orderId,paymentId]);
   if(row.rowCount===0){
    const prior=await pool.query('SELECT 1 FROM payment_review_alerts WHERE payment_id=$1',[paymentId]);
    if(!prior.rows.length)throw new Error('Payment review event has no verified payment');
   }
  }
 };
}

export function supportCaseHandlers(pool:Pool):Readonly<Record<string,OutboxHandler>>{
 return {
  'support.case_opened':async payload=>{
   if(!payload || typeof payload!=='object')throw new Error('Invalid support event');
   const value=payload as Record<string,unknown>;
   if(typeof value.caseId!=='string' ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.caseId))
    throw new Error('Invalid support case ID');
   const r=await pool.query(`INSERT INTO support_work_items(case_id)
    SELECT id FROM support_cases WHERE id=$1
    ON CONFLICT(case_id) DO NOTHING RETURNING id`,[value.caseId]);
   if(r.rowCount===0){
    const prior=await pool.query('SELECT id FROM support_work_items WHERE case_id=$1',[value.caseId]);
    if(!prior.rows.length)throw new Error('Unknown support case');
   }
  }
 };
}

export function guestBookingHandlers(pool:Pool):Readonly<Record<string,OutboxHandler>>{
 return {
  'guest.booking_verified':async payload=>{
   if(!payload||typeof payload!=='object'||!('requestId' in payload)||
     typeof payload.requestId!=='string' ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.requestId))
    throw new Error('Invalid guest handoff request');
   const item=await pool.query(`INSERT INTO guest_booking_work_items(request_id)
      SELECT id FROM guest_booking_requests WHERE id=$1 AND verified_at IS NOT NULL
       AND status IN ('pending_review','in_review')
      ON CONFLICT(request_id) DO NOTHING RETURNING id`,[payload.requestId]);
   if(item.rowCount===0){
    const previous=await pool.query('SELECT id FROM guest_booking_work_items WHERE request_id=$1',[payload.requestId]);
    if(!previous.rows.length)throw new Error('Guest verification missing');
   }
  }
 };
}
