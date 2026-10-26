import {ForbiddenException,Injectable,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase5SyntheticMode} from './mode';
import {classifyOperationalPosture,type PostureKey} from './posture';

@Injectable()
export class Phase5PostureService implements OnModuleDestroy{
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db():Pool{
  if(!this.pool)throw new ServiceUnavailableException('Readiness database unavailable');
  return this.pool;
 }
 async snapshot(identity:AuthenticatedIdentity){
  requirePhase5SyntheticMode();
  requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'audit:read');
  const client:PoolClient=await this.db.connect();
  try{
   await client.query('BEGIN READ ONLY'); // No table writes, no row locks.
   await client.query("SET LOCAL statement_timeout='8000ms'");
   const actor=await client.query<{id:string}>(`
     SELECT usr.id FROM users usr JOIN staff st ON st.user_id=usr.id
     WHERE usr.identity_subject=$1 AND st.active AND st.role='administrator'
     `,[identity.subject]);
   if(!actor.rows[0])throw new ForbiddenException('Administrator readiness access required');
   const measured=await client.query<Record<PostureKey,number>>(`
     SELECT
       (SELECT count(*)::int FROM phase3_incidents
         WHERE resolution_status='open') AS "openCustodyIncidents",
       (SELECT count(*)::int FROM outbox
         WHERE processed_at IS NULL AND dead_lettered_at IS NULL) AS "outboxPending",
       (SELECT count(*)::int FROM outbox
         WHERE dead_lettered_at IS NOT NULL) AS "outboxDeadLetters",
       (SELECT count(*)::int FROM phase4_result_intakes intake
         JOIN results res ON res.id=intake.result_id
         WHERE res.released_at IS NULL) AS "resultReleasePending",
       (SELECT count(*)::int FROM phase4_result_delivery_intents
         WHERE status IN ('pending','sending')) AS "resultEmailPending",
       (SELECT count(*)::int FROM phase4_result_delivery_intents
         WHERE status='failed') AS "resultEmailFailed",
       (SELECT count(*)::int FROM phase4_refund_requests
         WHERE status='pending') AS "refundReviewPending",
       (SELECT count(*)::int FROM phase4_lab_settlement_batches
         WHERE status='pending') AS "labSettlementReviewPending"
   `);
   const counts=measured.rows[0];
   if(!counts)throw new ServiceUnavailableException('Readiness snapshot unavailable');
   const posture=classifyOperationalPosture(counts);
   await client.query('COMMIT');
   // No patient-level information or clinical field is returned.
   return {data:posture};
  }catch(err){
   await client.query('ROLLBACK').catch(()=>undefined);
   throw err;
  }finally{client.release();}
 }
}
