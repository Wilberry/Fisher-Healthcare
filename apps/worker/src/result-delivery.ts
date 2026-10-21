import type {Pool} from 'pg';

type Claim={result_id:string;recipient:string;lease_token:string;attempts:number};
type Config={key:string;from:string;portal:string;allowed:readonly string[]};
const email=/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
const lower=(value:string)=>value.trim().toLowerCase();

export function stagingResultEmailSettings():Config|null{
  if(process.env.FISHER_PHASE4_OPERATION_MODE!=='synthetic-only' ||
    process.env.FISHER_PHASE4_RESULT_EMAIL_MODE!=='staging' ||
    process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only' ||
    process.env.NODE_ENV==='production')return null;
  const rawDb=process.env.DATABASE_URL;
  if(!rawDb)return null;
  let db:URL,portal:URL;
  try{
    db=new URL(rawDb);
    portal=new URL(process.env.FISHER_PHASE4_RESULT_PORTAL_URL??'');
  }catch{return null;}
  if(!['postgres:','postgresql:'].includes(db.protocol)||
    !['localhost','127.0.0.1'].includes(db.hostname)||
    db.pathname!=='/fisher_test'||portal.protocol!=='https:'||
    portal.username||portal.password||portal.search||portal.hash||portal.pathname!=='/')
    return null;
  const key=process.env.RESEND_API_KEY;
  const from=process.env.FISHER_PHASE4_RESULT_EMAIL_FROM;
  const allowed=(process.env.FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST??'')
    .split(',').map(lower).filter(Boolean);
  if(!key||!from||!email.test(from)||!allowed.length||
    allowed.some(value=>!email.test(value)))return null;
  return {key,from,portal:portal.origin,allowed};
}

export async function claimResultEmail(pool:Pool,allowed:readonly string[]):Promise<Claim|null>{
  const r=await pool.query<Claim>(`
    WITH candidate AS(
      SELECT n.result_id,u.email AS recipient FROM phase4_result_delivery_intents n
      JOIN results r ON r.id=n.result_id AND r.released_at IS NOT NULL
        AND r.released_by IS NOT NULL
      JOIN patient_relationships rel ON rel.patient_id=r.patient_id
        AND rel.can_view_results AND rel.verified_at IS NOT NULL
        AND rel.revoked_at IS NULL AND rel.relationship='self'
      JOIN phase4_result_email_preferences pref ON pref.user_id=rel.user_id
        AND pref.patient_id=rel.patient_id AND pref.enabled
      JOIN users u ON u.id=rel.user_id AND u.email IS NOT NULL
      WHERE n.channel='email'
        AND lower(u.email)=ANY($1::text[])
        AND (n.recipient_email IS NULL OR lower(n.recipient_email)=lower(u.email))
        AND n.attempts<5 AND n.next_attempt_at<=clock_timestamp()
        AND (n.status='pending' OR
          (n.status='sending' AND n.lease_expires_at<clock_timestamp()))
        AND (n.first_attempt_at IS NULL OR
          n.first_attempt_at>clock_timestamp()-interval '23 hours')
      ORDER BY n.created_at,n.result_id
      FOR UPDATE OF n SKIP LOCKED LIMIT 1
    )
    UPDATE phase4_result_delivery_intents n
      SET status='sending',attempts=n.attempts+1,
      lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '90 seconds',
      first_attempt_at=COALESCE(n.first_attempt_at,clock_timestamp()),
      last_attempt_at=clock_timestamp(),recipient_email=candidate.recipient
    FROM candidate WHERE n.result_id=candidate.result_id
    RETURNING n.result_id,n.recipient_email AS recipient,n.lease_token,n.attempts
  `,[allowed]);
  return r.rows[0]??null;
}

/** Recheck current consent and recipient identity immediately before the provider call. */
export async function resultClaimStillEligible(pool:Pool,claim:Claim):Promise<boolean>{
 const r=await pool.query(`
   SELECT 1 FROM phase4_result_delivery_intents n
   JOIN results res ON res.id=n.result_id
     AND res.released_at IS NOT NULL AND res.released_by IS NOT NULL
   JOIN patient_relationships rel ON rel.patient_id=res.patient_id
     AND rel.relationship='self' AND rel.can_view_results
     AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
   JOIN phase4_result_email_preferences pref ON pref.user_id=rel.user_id
     AND pref.patient_id=rel.patient_id AND pref.enabled
   JOIN users u ON u.id=rel.user_id
   WHERE n.result_id=$1 AND n.lease_token=$2
     AND n.status='sending' AND n.lease_expires_at>clock_timestamp()
     AND lower(n.recipient_email)=lower($3)
     AND lower(u.email)=lower($3)
   LIMIT 1`,[claim.result_id,claim.lease_token,claim.recipient]);
 return r.rowCount===1;
}

/** Staging email only. The message has no test names, clinical values or object keys. */
export async function dispatchResultEmail(pool:Pool,send:typeof fetch=fetch):Promise<boolean>{
  const config=stagingResultEmailSettings();
  if(!config)return false;
  await pool.query(`UPDATE phase4_result_delivery_intents SET status='failed',
    lease_token=NULL,lease_expires_at=NULL
    WHERE status IN ('pending','sending') AND first_attempt_at IS NOT NULL
      AND first_attempt_at<=clock_timestamp()-interval '23 hours'
      AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp())`);
  const claim=await claimResultEmail(pool,config.allowed);
  if(!claim)return false;
  // No network call after a known opt-out, grant revocation or lease loss.
  if(!await resultClaimStillEligible(pool,claim)){
    await pool.query(`UPDATE phase4_result_delivery_intents
      SET status='failed',lease_token=NULL,lease_expires_at=NULL
      WHERE result_id=$1 AND lease_token=$2 AND status='sending'`,
      [claim.result_id,claim.lease_token]);
    return true;
  }
  let providerId:string|null=null;
  try{
    const reply=await send('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:'Bearer '+config.key,
        'Content-Type':'application/json',
        'Idempotency-Key':'fisher-result-availability-'+claim.result_id},
      body:JSON.stringify({from:config.from,to:[claim.recipient],
        subject:'Your Fisher Healthcare account has an update',
        text:'A secure update is available. Sign in to your Fisher Healthcare account to view information you are permitted to access: '+config.portal+
          '/account/results . This message contains no medical information.'}),
      signal:AbortSignal.timeout(10000)
    });
    if(!reply.ok)throw new Error('Result notification rejected');
    const body:unknown=await reply.json();
    if(!body||typeof body!=='object'||!('id' in body)||
      typeof body.id!=='string'||body.id.length<8||body.id.length>128)
      throw new Error('Missing delivery receipt');
    providerId=body.id;
  }catch{
    await pool.query(`UPDATE phase4_result_delivery_intents
      SET status=CASE WHEN attempts>=5 OR first_attempt_at<=clock_timestamp()-interval '23 hours'
          THEN 'failed' ELSE 'pending' END,
      lease_token=NULL,lease_expires_at=NULL,
      next_attempt_at=clock_timestamp()+
        LEAST(3600,5*power(2,LEAST(attempts,9)))*interval '1 second'
      WHERE result_id=$1 AND lease_token=$2
        AND status='sending' AND lease_expires_at>clock_timestamp()`,
      [claim.result_id,claim.lease_token]);
    return true;
  }
  const updated=await pool.query(`UPDATE phase4_result_delivery_intents
    SET status='delivered',delivered_at=clock_timestamp(),provider_receipt=$3,
      lease_token=NULL,lease_expires_at=NULL
    WHERE result_id=$1 AND lease_token=$2 AND status='sending'
      AND lease_expires_at>clock_timestamp() RETURNING result_id`,
    [claim.result_id,claim.lease_token,providerId]);
  if(updated.rowCount!==1)throw new Error('Result delivery lease lost');
  return true;
}
