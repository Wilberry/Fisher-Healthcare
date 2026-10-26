import {BadRequestException,ConflictException,ForbiddenException,Injectable,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase5SyntheticMode} from './mode';
import {ALERT_CODES,actionForAlert,isAlertCode,validateAlertCounts,type AlertCode,type AlertStatus} from './alerts.policy';

type AlertRecord={
 code:AlertCode;status:AlertStatus;observed_count:number;
 acknowledged_by:string|null
};
@Injectable()
export class Phase5AlertsService implements OnModuleDestroy{
 private readonly pool?:Pool;
 constructor(private readonly access:AccessService){
  if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 }
 async onModuleDestroy(){await this.pool?.end();}
 private get db():Pool{
  if(!this.pool)throw new ServiceUnavailableException('Synthetic alert service unavailable');
  return this.pool;
 }
 private async staff(identity:AuthenticatedIdentity):Promise<void>{
  requirePhase5SyntheticMode();
  requireStaffMfa(identity);
  await this.access.requireStaffCapability(identity.subject,'audit:read');
 }
 private async admin(c:PoolClient,identity:AuthenticatedIdentity):Promise<string>{
  const res=await c.query<{id:string}>(`
    SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
    WHERE u.identity_subject=$1 AND st.active AND st.role='administrator'
  `,[identity.subject]);
  if(!res.rows[0])throw new ForbiddenException('Administrator access required');
  return res.rows[0].id;
 }
 private async transact<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.db.connect();
  try{
   await c.query('BEGIN');
   try{
     await c.query("SET LOCAL lock_timeout='3000ms'");
     await c.query("SET LOCAL statement_timeout='8000ms'");
     const value=await fn(c);await c.query('COMMIT');return value;}
   catch(e){await c.query('ROLLBACK');throw e;}
  }finally{c.release();}
 }
 async list(identity:AuthenticatedIdentity){
  await this.staff(identity);
  return this.transact(async c=>{
   await this.admin(c,identity);
   const rows=await c.query(`
     SELECT code,status,observed_count,first_seen_at,last_seen_at,
       acknowledged_at,resolved_at
     FROM phase5_operational_alerts ORDER BY code ASC
   `);
   // Bounded timeline for incident review. Never expose actor identifiers,
   // database object IDs, arbitrary metadata or clinical row references.
   const history=await c.query(`
     SELECT code,event_type,observed_count,recorded_at
     FROM phase5_alert_state_events
     ORDER BY recorded_at DESC,id DESC LIMIT 30
   `);
   return {data:rows.rows,history:history.rows,
     scope:'disposable-synthetic-only',
     externalPagingEnabled:false,pilotActivationAuthorized:false};
  });
 }
 async evaluate(identity:AuthenticatedIdentity){
  await this.staff(identity);
  return this.transact(async c=>{
   const actor=await this.admin(c,identity);
   await c.query("SELECT pg_advisory_xact_lock(hashtext('fisher-phase5-alert-evaluation'))");
   const current=await c.query(`
     SELECT
       (SELECT count(*)::int FROM phase3_incidents
         WHERE resolution_status='open') AS custody_incidents,
       (SELECT count(*)::int FROM outbox
         WHERE dead_lettered_at IS NOT NULL) AS outbox_dead_letters,
       (SELECT count(*)::int FROM phase4_result_delivery_intents
         WHERE status='failed') AS result_email_failures
   `);
   if(!current.rows[0])throw new ServiceUnavailableException('Alert measurements unavailable');
   const counts=validateAlertCounts(current.rows[0]);
   const changes:string[]=[];
   for(const code of ALERT_CODES){
    const value=counts[code];
    const existing=await c.query<AlertRecord>(`
      SELECT code,status,observed_count,acknowledged_by
      FROM phase5_operational_alerts WHERE code=$1 FOR UPDATE`,[code]);
    const row=existing.rows[0];
    if(!row){
     if(value===0)continue;
     await c.query(`
       INSERT INTO phase5_operational_alerts(code,status,observed_count)
       VALUES($1,'open',$2)`,[code,value]);
     changes.push(code+':opened');
    }else{
     const action=actionForAlert(value,row.status);
     if(action==='resolve'){
      await c.query(`
       UPDATE phase5_operational_alerts
       SET status='resolved',observed_count=0,resolved_at=now(),last_seen_at=now()
       WHERE code=$1`,[code]);
      changes.push(code+':resolved');
     }else if(action==='reopen'){
      await c.query(`
       UPDATE phase5_operational_alerts SET status='open',
        observed_count=$2,acknowledged_by=NULL,acknowledged_at=NULL,
        resolved_at=NULL,last_seen_at=now() WHERE code=$1`,[code,value]);
      changes.push(code+':reopened');
     }else{
      await c.query(`
       UPDATE phase5_operational_alerts
       SET observed_count=$2,last_seen_at=now() WHERE code=$1`,[code,value]);
     }
    }
   }
   // Append immutable, privacy-minimal transition history atomically
   // with the current state and existing security audit record.
   for(const change of changes){
    const [code,type]=change.split(':');
    if(!isAlertCode(code)||typeof type!=='string'||
       !['opened','resolved','reopened'].includes(type))
     throw new ServiceUnavailableException('Invalid synthetic alert transition');
    await c.query(`
      INSERT INTO phase5_alert_state_events(
        code,event_type,observed_count,actor_id)
      VALUES($1,$2,$3,$4)`,[code,type,counts[code],actor]);
    await c.query(`
     INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
     VALUES($1,'phase5.alert.state_changed','operational_alert',NULL,$2::jsonb)`,
     [actor,JSON.stringify({transition:change})]);
   }
   return {data:{counts,changes,scope:'disposable-synthetic-only',
      externalPagingEnabled:false,pilotActivationAuthorized:false}};
  });
 }
 async acknowledge(identity:AuthenticatedIdentity,code:unknown){
  await this.staff(identity);
  if(!isAlertCode(code))throw new BadRequestException('Invalid alert signal');
  return this.transact(async c=>{
   const actor=await this.admin(c,identity);
   const current=await c.query<AlertRecord>(`
     SELECT code,status,observed_count,acknowledged_by
     FROM phase5_operational_alerts WHERE code=$1 FOR UPDATE`,[code]);
   const row=current.rows[0];
   if(!row)throw new ConflictException('No alert to acknowledge');
   if(row.status==='acknowledged'){
    if(row.acknowledged_by!==actor)throw new ConflictException('Alert already acknowledged');
    return {data:{code,status:'acknowledged',replayed:true}};
   }
   if(row.status!=='open')throw new ConflictException('Only open alerts can be acknowledged');
   await c.query(`
    UPDATE phase5_operational_alerts
    SET status='acknowledged',acknowledged_by=$2,acknowledged_at=now()
    WHERE code=$1 AND status='open'`,[code,actor]);
   await c.query(`
    INSERT INTO phase5_alert_state_events(
      code,event_type,observed_count,actor_id)
    VALUES($1,'acknowledged',$2,$3)`,[code,row.observed_count,actor]);
   await c.query(`
    INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
    VALUES($1,'phase5.alert.acknowledged','operational_alert',NULL,$2::jsonb)`,
    [actor,JSON.stringify({code})]);
   return {data:{code,status:'acknowledged',replayed:false}};
  });
 }
}
