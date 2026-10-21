import { Injectable, OnModuleDestroy, ForbiddenException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AccessService } from '../access.service';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { requirePhase4SyntheticMode } from './phase4-mode';
import { intakeFingerprint, type ResultIntakeInput } from './result-policy';
import {readSyntheticResultDocument,syntheticDocumentModeEnabled} from './document-store';

type IntakeRow={id:string;fingerprint:string;released_at:Date|null};
type Provenance={actor_id:string;order_id:string;patient_id:string;lab_id:string};

@Injectable()
export class Phase4ResultsService implements OnModuleDestroy {
  private readonly pool?:Pool;
  constructor(private readonly access:AccessService){
    if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
  }
  async onModuleDestroy(){await this.pool?.end();}
  private get db():Pool{
    if(!this.pool)throw new ServiceUnavailableException('Results database unavailable');
    return this.pool;
  }
  private async transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
    const c=await this.db.connect();
    try{
      await c.query('BEGIN');
      try{const value=await run(c);await c.query('COMMIT');return value;}
      catch(error){await c.query('ROLLBACK');throw error;}
    }finally{c.release();}
  }

  /** A current laboratory grant and a RECEIVED + ACCEPTED specimen are both required. */
  async intake(identity:AuthenticatedIdentity,input:ResultIntakeInput){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'labs:manage');
    const fingerprint=intakeFingerprint(input);
    try{return await this.transaction(async c=>{
      const scope=await c.query<Provenance>(`
        SELECT u.id AS actor_id,o.id AS order_id,o.patient_id,o.lab_id
        FROM users u JOIN staff st ON st.user_id=u.id
        JOIN phase3_lab_staff_access granted ON granted.staff_id=st.id
        JOIN laboratories lab ON lab.id=granted.lab_id
        JOIN orders o ON o.lab_id=lab.id
        JOIN order_items item ON item.order_id=o.id
        JOIN specimens sp ON sp.order_id=o.id
        JOIN phase3_manifest_specimens ms ON ms.specimen_id=sp.id
        JOIN phase3_manifest_receipts receipt ON receipt.manifest_id=ms.manifest_id
        WHERE u.identity_subject=$1 AND item.id=$2 AND sp.id=$3
          AND st.active AND st.role='lab_coordinator' AND granted.active
          AND granted.revoked_at IS NULL AND lab.active AND sp.status='lab_received'
          AND receipt.accepted_specimen_ids @> jsonb_build_array(sp.id::text)
          AND NOT EXISTS(SELECT 1 FROM phase3_incidents inc
            WHERE inc.specimen_id=sp.id AND inc.resolution_status='open')
        FOR SHARE OF granted,sp,o,item
      `,[identity.subject,input.orderItemId,input.specimenId]);
      const source=scope.rows[0];
      if(!source)throw new ForbiddenException('Laboratory result intake denied');
      const existing=await c.query<IntakeRow>(`
        SELECT i.result_id AS id,i.intake_fingerprint AS fingerprint,r.released_at
        FROM phase4_result_intakes i JOIN results r ON r.id=i.result_id
        WHERE i.intake_key=$1 FOR SHARE OF i,r`,[input.intakeKey]);
      const prior=existing.rows[0];
      if(prior){
        if(prior.fingerprint!==fingerprint)throw new ConflictException('Result intake key reused');
        return {data:{id:prior.id,status:prior.released_at?'released':'pending_review',replayed:true}};
      }
      // Never accept a patient/order ID from the caller: both are derived from
      // the verified ordered test, accepted specimen and lab grant above.
      const record=await c.query<{id:string}>(`
        INSERT INTO results(order_id,patient_id,object_key)
        VALUES($1,$2,$3) RETURNING id`,
        [source.order_id,source.patient_id,input.objectKey]);
      const resultId=record.rows[0]!.id;
      await c.query(`
        INSERT INTO phase4_result_intakes(result_id,order_item_id,specimen_id,lab_id,
          intake_key,intake_fingerprint,document_sha256,validation_reference,intake_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [resultId,input.orderItemId,input.specimenId,source.lab_id,input.intakeKey,
         fingerprint,input.documentSha256,input.validationReference,source.actor_id]);
      await c.query(`
        INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
        VALUES($1,'phase4.result.intake','result',$2)`,[source.actor_id,resultId]);
      return {data:{id:resultId,status:'pending_review',replayed:false}};
    });}catch(error){
      if(error&&typeof error==='object'&&'code' in error&&
          (error as {code:unknown}).code==='23505')
        throw new ConflictException('Result already submitted for ordered test');
      throw error;
    }
  }

  /** Independent result-release staff, separate from the laboratory submitter. */
  async release(identity:AuthenticatedIdentity,resultId:string,releaseKey:string){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'results:release');
    return this.transaction(async c=>{
      const staff=await c.query<{id:string}>(`
        SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
        WHERE u.identity_subject=$1 AND st.active
          AND st.role IN ('result_release','administrator')
        FOR SHARE OF st`,[identity.subject]);
      const actorId=staff.rows[0]?.id;
      if(!actorId)throw new ForbiddenException('Result release denied');
      const row=await c.query<{
        id:string;released_at:Date|null;intake_by:string;specimen_id:string;
      }>(`
        SELECT r.id,r.released_at,i.intake_by,i.specimen_id
        FROM results r JOIN phase4_result_intakes i ON i.result_id=r.id
        WHERE r.id=$1 FOR UPDATE OF r`,[resultId]);
      const result=row.rows[0];
      if(!result)throw new ForbiddenException('Result release denied');
      if(result.intake_by===actorId)throw new ForbiddenException('Independent result reviewer required');
      if(result.released_at){
        const existing=await c.query<{release_key:string}>(`
          SELECT release_key FROM phase4_result_release_events WHERE result_id=$1`,[resultId]);
        if(existing.rows[0]?.release_key!==releaseKey)
          throw new ConflictException('Result already released');
        return {data:{id:resultId,status:'released',replayed:true}};
      }
      // A later open incident, rejection or custody change blocks release.
      const eligible=await c.query(`
        SELECT 1 FROM specimens sp
        JOIN phase3_manifest_specimens ms ON ms.specimen_id=sp.id
        JOIN phase3_manifest_receipts receipt ON receipt.manifest_id=ms.manifest_id
        WHERE sp.id=$1 AND sp.status='lab_received'
          AND receipt.accepted_specimen_ids @> jsonb_build_array(sp.id::text)
          AND NOT EXISTS(SELECT 1 FROM phase3_incidents inc
            WHERE inc.specimen_id=sp.id AND inc.resolution_status='open')
        FOR SHARE OF sp`,[result.specimen_id]);
      if(eligible.rowCount!==1)throw new ConflictException('Specimen not eligible for release');
      const updated=await c.query(`
        UPDATE results SET released_at=now(),released_by=$2,updated_at=now()
        WHERE id=$1 AND released_at IS NULL RETURNING id`,[resultId,actorId]);
      if(updated.rowCount!==1)throw new ConflictException('Result state changed');
      await c.query(`
        INSERT INTO phase4_result_release_events(result_id,release_key,released_by)
        VALUES($1,$2,$3)`,[resultId,releaseKey,actorId]);
      // Email is only queued here; no clinical data or document key enters
      // any notification payload and no unapproved provider sends it.
      await c.query(`
        INSERT INTO phase4_result_delivery_intents(result_id,channel)
        VALUES($1,'email') ON CONFLICT DO NOTHING`,[resultId]);
      await c.query(`
        INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
        VALUES($1,'phase4.result.released','result',$2)`,[actorId,resultId]);
      return {data:{id:resultId,status:'released',replayed:false}};
    });
  }

  async pending(identity:AuthenticatedIdentity){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'results:release');
    const r=await this.db.query(`
      SELECT res.id,intake.lab_id,intake.created_at
      FROM results res JOIN phase4_result_intakes intake ON intake.result_id=res.id
      WHERE res.released_at IS NULL
      ORDER BY intake.created_at,intake.result_id LIMIT 100`);
    return {data:r.rows};
  }

  async list(identity:AuthenticatedIdentity,patientId:string){
    requirePhase4SyntheticMode();
    return this.transaction(async c=>{
      // Booking permission is never sufficient for clinical results.
      const access=await c.query<{id:string}>(`
        SELECT u.id FROM users u JOIN patient_relationships rel ON rel.user_id=u.id
        WHERE u.identity_subject=$1 AND rel.patient_id=$2
          AND rel.can_view_results AND rel.verified_at IS NOT NULL
          AND rel.revoked_at IS NULL FOR SHARE OF rel`,[identity.subject,patientId]);
      const actorId=access.rows[0]?.id;
      if(!actorId)throw new ForbiddenException('Result access denied');
      const records=await c.query(`
        SELECT r.id,r.released_at,item.test_id,t.name AS test_name
        FROM results r JOIN phase4_result_intakes intake ON intake.result_id=r.id
        JOIN order_items item ON item.id=intake.order_item_id
        JOIN tests t ON t.id=item.test_id
        WHERE r.patient_id=$1 AND r.released_at IS NOT NULL
          AND r.released_by IS NOT NULL
        ORDER BY r.released_at DESC,r.id DESC LIMIT 100`,[patientId]);
      await c.query(`
        INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
        VALUES($1,'phase4.results.listed','patient',$2,$3::jsonb)`,
        [actorId,patientId,JSON.stringify({count:records.rows.length})]);
      return {data:records.rows};
    });
  }

  async detail(identity:AuthenticatedIdentity,resultId:string){
    requirePhase4SyntheticMode();
    return this.transaction(async c=>{
      const authorized=await c.query<{
        actor_id:string;id:string;released_at:Date;test_id:string;test_name:string;object_key:string;document_sha256:string;
      }>(`
        SELECT u.id AS actor_id,r.id,r.released_at,item.test_id,t.name AS test_name,
          r.object_key,intake.document_sha256
        FROM users u JOIN patient_relationships rel ON rel.user_id=u.id
        JOIN results r ON r.patient_id=rel.patient_id
        JOIN phase4_result_intakes intake ON intake.result_id=r.id
        JOIN order_items item ON item.id=intake.order_item_id
        JOIN tests t ON t.id=item.test_id
        WHERE u.identity_subject=$1 AND r.id=$2
          AND rel.can_view_results AND rel.verified_at IS NOT NULL
          AND rel.revoked_at IS NULL AND r.released_at IS NOT NULL
          AND r.released_by IS NOT NULL
        FOR SHARE OF rel,r`,[identity.subject,resultId]);
      const value=authorized.rows[0];
      if(!value)throw new ForbiddenException('Result access denied');
      await c.query(`
        INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
        VALUES($1,'phase4.result.viewed','result',$2)`,[value.actor_id,resultId]);
      // The protected object key and clinical document are never returned
      // until a separately reviewed private-storage delivery adapter exists.
      const available=syntheticDocumentModeEnabled()&&
        await readSyntheticResultDocument(value.object_key,value.document_sha256)
          .then(()=>true).catch(()=>false);
      return {data:{id:value.id,releasedAt:value.released_at,
        testId:value.test_id,testName:value.test_name,
        documentAccess:available?'synthetic_document_available':'pending_secure_delivery'}};
    });
  }
  async document(identity:AuthenticatedIdentity,resultId:string):Promise<Buffer>{
    requirePhase4SyntheticMode();
    return this.transaction(async c=>{
      const permitted=await c.query<{
        actor_id:string;object_key:string;document_sha256:string
      }>(`
        SELECT u.id AS actor_id,r.object_key,intake.document_sha256
        FROM users u JOIN patient_relationships rel ON rel.user_id=u.id
        JOIN results r ON r.patient_id=rel.patient_id
        JOIN phase4_result_intakes intake ON intake.result_id=r.id
        WHERE u.identity_subject=$1 AND r.id=$2
          AND rel.can_view_results AND rel.verified_at IS NOT NULL
          AND rel.revoked_at IS NULL AND r.released_at IS NOT NULL
          AND r.released_by IS NOT NULL FOR SHARE OF rel,r`,
        [identity.subject,resultId]);
      const record=permitted.rows[0];
      if(!record)throw new ForbiddenException('Result document access denied');
      const bytes=await readSyntheticResultDocument(
        record.object_key,record.document_sha256);
      await c.query(`
        INSERT INTO audit_events(actor_id,action,resource_type,resource_id)
        VALUES($1,'phase4.result.document_downloaded','result',$2)`,
        [record.actor_id,resultId]);
      return bytes;
    });
  }

}
