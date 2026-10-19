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
    AND lower(coalesce(n.recipient_email,u.email))=ANY($1::text[]) AND n.attempts<5
    AND n.next_attempt_at<=clock_timestamp()
    AND EXISTS(SELECT 1 FROM patient_relationships r WHERE r.patient_id=o.patient_id
      AND r.user_id=o.booked_by AND r.can_book AND r.verified_at IS NOT NULL AND r.revoked_at IS NULL)
    AND (n.status='pending' OR
      (n.status='sending' AND n.lease_expires_at<clock_timestamp()))
    AND (n.first_attempt_at IS NULL OR n.first_attempt_at>clock_timestamp()-interval '23 hours')
  ORDER BY n.created_at,n.id
  FOR UPDATE OF n SKIP LOCKED LIMIT 1
 )
 UPDATE notification_intents n SET status='sending',attempts=n.attempts+1,
   lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',
   first_attempt_at=coalesce(n.first_attempt_at,clock_timestamp()),
   last_attempt_at=clock_timestamp(),
   recipient_email=coalesce(n.recipient_email,u.email)
 FROM target,orders o,users u
 WHERE n.id=target.id AND o.id=n.order_id AND u.id=o.booked_by
 RETURNING n.id,n.order_id,n.recipient_email AS recipient,n.lease_token,n.attempts,n.first_attempt_at`,
 [allowed]);
 return claim.rows[0]??null;
}
export async function dispatchNotification(pool:Pool, send:typeof fetch=fetch):Promise<boolean>{
 const cfg=stagingEmailSettings();
 if(!cfg)return false;
 // An ambiguous send must not retry beyond the provider's 24h idempotency window.
 await pool.query(`UPDATE notification_intents SET status='failed',
    lease_token=NULL,lease_expires_at=NULL WHERE
    status IN ('pending','sending') AND first_attempt_at IS NOT NULL
    AND first_attempt_at<=clock_timestamp()-interval '23 hours'
    AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp())`);
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
    lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=clock_timestamp()+
      LEAST(3600,5*power(2,LEAST(attempts,9))) * interval '1 second'
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
