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
