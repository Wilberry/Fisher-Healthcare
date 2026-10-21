import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {AccessService} from '../access.service';
import {Phase4ResultsService} from './results.service';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only' &&
  process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('Phase 4 patient-scoped results (disposable PostgreSQL only)',()=>{
  const prev=process.env.FISHER_PHASE4_OPERATION_MODE;
  const previousDocumentMode=process.env.FISHER_PHASE4_DOCUMENT_MODE;
  const previousDocumentDir=process.env.FISHER_PHASE4_PRIVATE_DOCUMENT_DIR;
  let pool:Pool,access:AccessService,service:Phase4ResultsService;
  const id={
    owner:randomUUID(),labUser:randomUUID(),reviewUser:randomUUID(),
    outsider:randomUUID(),labStaff:randomUUID(),reviewStaff:randomUUID(),
    patient:randomUUID(),lab:randomUUID(),test:randomUUID(),order:randomUUID(),
    item:randomUUID(),specimen:randomUUID(),manifest:randomUUID(),
    receiptKey:randomUUID(),grant:randomUUID(),intakeKey:randomUUID(),
    releaseKey:randomUUID()
  };
  const sub={
    owner:'synthetic-results-owner-'+randomUUID(),
    lab:'synthetic-results-lab-'+randomUUID(),
    reviewer:'synthetic-results-reviewer-'+randomUUID(),
    outsider:'synthetic-results-outsider-'+randomUUID()
  };
  const identity=(subject:string,mfa=false)=>({
    subject,issuer:'https://identity.fisher.test',authenticationMethods:mfa?['mfa']:[]
  });
  const syntheticPdf=Buffer.from('%PDF-1.4\nSYNTHETIC ONLY\n%%EOF\n');
  let privateDir='';
  const envelope={
    orderItemId:id.item,specimenId:id.specimen,intakeKey:id.intakeKey,
    objectKey:'synthetic/results/'+id.intakeKey+'.pdf',
    documentSha256:createHash('sha256').update(syntheticPdf).digest('hex'),validationReference:'SYN-VALIDATED-0001'
  };
  let resultId:string;
  beforeAll(async()=>{
    process.env.FISHER_PHASE4_OPERATION_MODE='synthetic-only';
    privateDir=await mkdtemp('/tmp/fisher-healthcare-phase4-private-');
    await writeFile(privateDir+'/'+id.intakeKey+'.pdf',syntheticPdf);
    process.env.FISHER_PHASE4_DOCUMENT_MODE='synthetic-only';
    process.env.FISHER_PHASE4_PRIVATE_DOCUMENT_DIR=privateDir;
    if(!process.env.DATABASE_URL||process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')
      throw new Error('Disposable test database required');
    pool=new Pool({connectionString:process.env.DATABASE_URL});
    const actual=await pool.query<{name:string}>('SELECT current_database() AS name');
    if(actual.rows[0]?.name!=='fisher_test')throw new Error('Refusing non-disposable database');
    const migration=await pool.query<{present:string|null}>(
      "SELECT to_regclass('public.phase4_result_intakes')::text AS present");
    if(!migration.rows[0]?.present)throw new Error('Phase 4 migration not installed');
    await pool.query(
      'INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4),($5,$6),($7,$8)',
      [id.owner,sub.owner,id.labUser,sub.lab,id.reviewUser,sub.reviewer,id.outsider,sub.outsider]);
    await pool.query("INSERT INTO patients(id,display_name) VALUES($1,'Synthetic Results Patient')",[id.patient]);
    await pool.query(`INSERT INTO patient_relationships(user_id,patient_id,relationship,can_book,
      can_view_results,verified_at) VALUES($1,$2,'self',true,false,now())`,
      [id.owner,id.patient]);
    await pool.query(
      "INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic Phase 4 Laboratory',true)",[id.lab]);
    await pool.query(
      "INSERT INTO tests(id,code,name,specimen_type,active) VALUES($1,$2,'Synthetic Lab Test','blood',true)",
      [id.test,'SYN-PHASE4-'+id.test.slice(0,8)]);
    await pool.query(
      "INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo) VALUES($1,$2,$3,$4,'collected','regular',10000)",
      [id.order,id.patient,id.owner,id.lab]);
    await pool.query("INSERT INTO order_items(id,order_id,test_id,price_kobo) VALUES($1,$2,$3,10000)",
      [id.item,id.order,id.test]);
    await pool.query(
      "INSERT INTO specimens(id,order_id,barcode,status) VALUES($1,$2,$3,'lab_received')",
      [id.specimen,id.order,'SYN-PHASE4-'+id.specimen]);
    await pool.query("INSERT INTO staff(id,user_id,role,active) VALUES($1,$2,'lab_coordinator',true),($3,$4,'result_release',true)",
      [id.labStaff,id.labUser,id.reviewStaff,id.reviewUser]);
    await pool.query(
      "INSERT INTO phase3_lab_staff_access(lab_id,staff_id,active,granted_by) VALUES($1,$2,true,$3)",
      [id.lab,id.labStaff,id.reviewUser]);
    await pool.query(
      "INSERT INTO phase3_lab_manifests(id,lab_id,created_by,status,received_at,received_by) VALUES($1,$2,$3,'received',now(),$3)",
      [id.manifest,id.lab,id.labUser]);
    await pool.query(
      "INSERT INTO phase3_manifest_specimens(manifest_id,specimen_id) VALUES($1,$2)",
      [id.manifest,id.specimen]);
    await pool.query(`INSERT INTO phase3_manifest_receipts(manifest_id,receipt_key,received_by,
      accepted_specimen_ids,rejected_specimen_ids) VALUES($1,$2,$3,$4::jsonb,'[]'::jsonb)`,
      [id.manifest,id.receiptKey,id.labUser,JSON.stringify([id.specimen])]);
    access=new AccessService();
    service=new Phase4ResultsService(access);
  });
  afterAll(async()=>{
    if(prev===undefined)delete process.env.FISHER_PHASE4_OPERATION_MODE;
    else process.env.FISHER_PHASE4_OPERATION_MODE=prev;
    await service?.onModuleDestroy();
    await access?.onModuleDestroy();
    await pool?.end();
    if(previousDocumentMode===undefined)delete process.env.FISHER_PHASE4_DOCUMENT_MODE;
    else process.env.FISHER_PHASE4_DOCUMENT_MODE=previousDocumentMode;
    if(previousDocumentDir===undefined)delete process.env.FISHER_PHASE4_PRIVATE_DOCUMENT_DIR;
    else process.env.FISHER_PHASE4_PRIVATE_DOCUMENT_DIR=previousDocumentDir;
    if(privateDir)await rm(privateDir,{recursive:true,force:true});
  });
  it('denies unauthenticated-strength or unscoped intake before any result is stored',async()=>{
    await expect(service.intake(identity(sub.lab),envelope)).rejects.toThrow();
    await expect(service.intake(identity(sub.outsider,true),envelope)).rejects.toThrow();
    const count=await pool.query('SELECT 1 FROM phase4_result_intakes WHERE order_item_id=$1',[id.item]);
    expect(count.rowCount).toBe(0);
  });
  it('records one lab-authorized pending intake; repeated identical IDs are idempotent',async()=>{
    const first=await service.intake(identity(sub.lab,true),envelope);
    resultId=first.data.id;
    expect(first.data.status).toBe('pending_review');
    expect(first.data.replayed).toBe(false);
    const replay=await service.intake(identity(sub.lab,true),envelope);
    expect(replay.data.id).toBe(resultId);
    expect(replay.data.replayed).toBe(true);
    await expect(service.intake(identity(sub.lab,true),{
      ...envelope,documentSha256:'b'.repeat(64)
    })).rejects.toThrow();
  });
  it('never grants diagnostic access from booking authority alone',async()=>{
    await expect(service.list(identity(sub.owner),id.patient)).rejects.toThrow();
    await expect(service.detail(identity(sub.owner),resultId)).rejects.toThrow();
  });
  it('requires an independent MFA result-release actor',async()=>{
    await expect(service.release(identity(sub.lab,true),resultId,id.releaseKey)).rejects.toThrow();
    await expect(service.release(identity(sub.reviewer),resultId,id.releaseKey)).rejects.toThrow();
    // A missing or corrupted PDF must not mark a result released.
    await writeFile(privateDir+'/'+id.intakeKey+'.pdf',Buffer.from('invalid'));
    await expect(service.release(identity(sub.reviewer,true),resultId,id.releaseKey))
      .rejects.toThrow();
    const notReleased=await pool.query(
      'SELECT released_at FROM results WHERE id=$1',[resultId]);
    expect(notReleased.rows[0]?.released_at).toBeNull();
    await writeFile(privateDir+'/'+id.intakeKey+'.pdf',syntheticPdf);
    const first=await service.release(identity(sub.reviewer,true),resultId,id.releaseKey);
    expect(first.data).toMatchObject({id:resultId,status:'released',replayed:false});
    expect((await service.release(identity(sub.reviewer,true),resultId,id.releaseKey))
      .data.replayed).toBe(true);
    await expect(service.release(identity(sub.reviewer,true),resultId,randomUUID()))
      .rejects.toThrow();
    const intent=await pool.query(
      "SELECT status FROM phase4_result_delivery_intents WHERE result_id=$1 AND channel='email'",
      [resultId]);
    expect(intent.rows).toEqual([{status:'pending'}]);
  });
  it('exposes only released metadata to explicitly authorized patient relationships and audits each read',async()=>{
    await pool.query(
      'UPDATE patient_relationships SET can_view_results=true WHERE user_id=$1 AND patient_id=$2',
      [id.owner,id.patient]);
    const list=await service.list(identity(sub.owner),id.patient);
    expect(list.data).toHaveLength(1);
    const detail=await service.detail(identity(sub.owner),resultId);
    const serialized=JSON.stringify({list,detail});
    expect(serialized).not.toContain(envelope.objectKey);
    expect(serialized).not.toContain(envelope.documentSha256);
    expect(detail.data.documentAccess).toBe('synthetic_document_available');
    await expect(service.list(identity(sub.outsider),id.patient)).rejects.toThrow();
    await expect(service.detail(identity(sub.outsider),resultId)).rejects.toThrow();
    const audit=await pool.query<{action:string}>(
      "SELECT action FROM audit_events WHERE resource_id=$1 AND action LIKE 'phase4.results.%'",
      [id.patient]);
    expect(audit.rows.some(x=>x.action==='phase4.results.listed')).toBe(true);
  });  it('downloads only an authorized, released and integrity-verified synthetic PDF',async()=>{
    try{
      const detail=await service.detail(identity(sub.owner),resultId);
      expect(detail.data.documentAccess).toBe('synthetic_document_available');
      const bytes=await service.document(identity(sub.owner),resultId);
      expect(bytes).toEqual(syntheticPdf);
      await expect(service.document(identity(sub.outsider),resultId)).rejects.toThrow();
      await writeFile(privateDir+'/'+id.intakeKey+'.pdf',Buffer.from('invalid'));
      await expect(service.document(identity(sub.owner),resultId)).rejects.toThrow();
    }finally{
      await writeFile(privateDir+'/'+id.intakeKey+'.pdf',syntheticPdf);
    }
  });
  it('requires separate explicit email opt-in and permits revocation only by self',async()=>{
    await expect(service.emailPreference(identity(sub.outsider),id.patient,true))
      .rejects.toThrow();
    const initial=await service.readEmailPreference(identity(sub.owner),id.patient);
    expect(initial.data.emailEnabled).toBe(false);
    const optedIn=await service.emailPreference(identity(sub.owner),id.patient,true);
    expect(optedIn.data.emailEnabled).toBe(true);
    expect((await service.readEmailPreference(identity(sub.owner),id.patient))
      .data.emailEnabled).toBe(true);
    const optedOut=await service.emailPreference(identity(sub.owner),id.patient,false);
    expect(optedOut.data.emailEnabled).toBe(false);
    const row=await pool.query<{enabled:boolean}>(`
      SELECT enabled FROM phase4_result_email_preferences
      WHERE user_id=$1 AND patient_id=$2`,[id.owner,id.patient]);
    expect(row.rows[0]?.enabled).toBe(false);
  });

});
