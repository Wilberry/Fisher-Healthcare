import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

type Claim={id:string;order_id:string;recipient:string;lease_token:string;attempts:number;first_attempt_at:Date};
export function stagingEmailSettings(){
 if(process.env.FISHER_PHASE2_EMAIL_MODE!=='staging' ||
    process.env.FISHER_PHASE2_BOOKING_MODE!=='synthetic' ||
    process.env.NODE_ENV==='production')return null;
 const key=process.env.RESEND_API_KEY;
 const from=process.env.FISHER_STAGING_EMAIL_FROM;
 const allowed=(process.env.FISHER_STAGING_EMAIL_ALLOWLIST??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 const email=/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
 if(!key || !from || !email.test(from) || !allowed.length || allowed.some(x=>!email.test(x)))
  return null;
 return {key,from,allowed};
}
export async function claimNotification(pool:Pool,allowed:readonly string[]):Promise<Claim|null>{
 const claim=await pool.query<Claim>(`WITH target AS (
  SELECT n.id FROM notification_intents n
  JOIN orders o ON o.id=n.order_id AND o.status='confirmed'
  JOIN users u ON u.id=o.booked_by
  WHERE n.channel='email' AND n.template='booking_confirmed'
    AND lower(u.email)=ANY($1::text[]) AND n.attempts<5
    AND (n.status='pending' OR
      (n.status='sending' AND n.lease_expires_at<clock_timestamp()))
    AND (n.first_attempt_at IS NULL OR n.first_attempt_at>clock_timestamp()-interval '23 hours')
  ORDER BY n.created_at,n.id
  FOR UPDATE OF n SKIP LOCKED LIMIT 1
 )
 UPDATE notification_intents n SET status='sending',attempts=n.attempts+1,
   lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',
   first_attempt_at=coalesce(n.first_attempt_at,clock_timestamp()),
   last_attempt_at=clock_timestamp()
 FROM target,orders o,users u
 WHERE n.id=target.id AND o.id=n.order_id AND u.id=o.booked_by
 RETURNING n.id,n.order_id,u.email AS recipient,n.lease_token,n.attempts,n.first_attempt_at`,
 [allowed]);
 return claim.rows[0]??null;
}
export async function dispatchNotification(pool:Pool, send:typeof fetch=fetch):Promise<boolean>{
 const cfg=stagingEmailSettings();
 if(!cfg)return false;
 const claim=await claimNotification(pool,cfg.allowed);
 if(!claim)return false;
 // No names, conditions, addresses, results or clinical details in notifications.
 let providerId:string|null=null;
 try{
  const result=await send('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',
    'Idempotency-Key':'fisher-booking-confirmed-'+claim.id},
   body:JSON.stringify({from:cfg.from,to:[claim.recipient],
    subject:'Fisher Healthcare booking status',
    text:'Your appointment has been confirmed. Sign in to your Fisher Healthcare account to view the details. Do not reply with medical information.'}),
   signal:AbortSignal.timeout(10000)
  });
  if(!result.ok)throw new Error('Provider rejected email request');
  const body:unknown=await result.json();
  if(!body || typeof body!=='object'||!('id' in body)||
   typeof body.id!=='string'||body.id.length<8||body.id.length>128)
   throw new Error('Provider acceptance receipt missing');
  providerId=body.id;
 }catch{
  // Unknown network outcome: reuse provider idempotency key only within its
  // 24-hour guarantee. After that window no automatic new delivery is made.
  await pool.query(`UPDATE notification_intents SET
    status=CASE WHEN attempts>=5 OR first_attempt_at<=clock_timestamp()-interval '23 hours'
                THEN 'failed' ELSE 'pending' END,
    lease_token=NULL,lease_expires_at=NULL
   WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp()`,
   [claim.id,claim.lease_token]);
  return true;
 }
 const updated=await pool.query(`UPDATE notification_intents SET status='sent',
   sent_at=clock_timestamp(),provider_receipt=$3,lease_token=NULL,lease_expires_at=NULL
   WHERE id=$1 AND lease_token=$2 AND lease_expires_at>clock_timestamp()
   AND status='sending' RETURNING id`,[claim.id,claim.lease_token,providerId]);
 if(updated.rowCount!==1)throw new Error('Email delivery lease lost before receipt persistence');
 return true;
}
export function notificationTestClaimId(){return randomUUID();}
