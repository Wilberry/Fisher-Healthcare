import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {AccessService} from '../access.service';
import {Phase4RefundService} from './refund.service';
import {Phase4LabSettlementsService} from './lab-settlement.service';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&
  process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('Phase 4 independent finance approvals (disposable PostgreSQL)',()=>{
  const previous=process.env.FISHER_PHASE4_OPERATION_MODE;
  const ids={
    finance1:randomUUID(),finance2:randomUUID(),
    staff1:randomUUID(),staff2:randomUUID(),
    patient:randomUUID(),lab:randomUUID(),order:randomUUID(),payment:randomUUID(),
    test:randomUUID(),item:randomUUID(),specimen:randomUUID(),result:randomUUID(),
    intake:randomUUID(),refundKey:randomUUID(),batchKey:randomUUID()
  };
  const subjectA='syn-phase4-finance-a-'+randomUUID();
  const subjectB='syn-phase4-finance-b-'+randomUUID();
  const identity=(subject:string,mfa=true)=>({
    subject,issuer:'https://identity.fisher.test',
    authenticationMethods:mfa?['mfa']:[]
  });
  let pool:Pool,access:AccessService,refunds:Phase4RefundService,
    settlements:Phase4LabSettlementsService;
  let refundId:string,payableId:string;
  beforeAll(async()=>{
    process.env.FISHER_PHASE4_OPERATION_MODE='synthetic-only';
    if(process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only'||!process.env.DATABASE_URL)
      throw new Error('Disposable PostgreSQL required');
    pool=new Pool({connectionString:process.env.DATABASE_URL});
    const db=await pool.query<{name:string}>('SELECT current_database() AS name');
    if(db.rows[0]?.name!=='fisher_test')throw new Error('Refusing non-disposable database');
    const migration=await pool.query<{name:string|null}>(
      "SELECT to_regclass('public.phase4_lab_payables')::text AS name");
    if(!migration.rows[0]?.name)throw new Error('Missing Phase 4 payout migrations');
    await pool.query('INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4)',
      [ids.finance1,subjectA,ids.finance2,subjectB]);
    await pool.query(`INSERT INTO staff(id,user_id,role,active)
      VALUES($1,$2,'finance',true),($3,$4,'finance',true)`,
      [ids.staff1,ids.finance1,ids.staff2,ids.finance2]);
    await pool.query("INSERT INTO patients(id,display_name) VALUES($1,'Synthetic Approval Patient')",
      [ids.patient]);
    await pool.query("INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic Approval Lab',true)",
      [ids.lab]);
    await pool.query(`INSERT INTO tests(id,code,name,specimen_type,active)
      VALUES($1,$2,'Synthetic Approval Test','blood',true)`,
      [ids.test,'SYN-APPROVAL-'+ids.test.slice(0,8)]);
    await pool.query(`INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo)
      VALUES($1,$2,$3,$4,'collected','regular',10000)`,
      [ids.order,ids.patient,ids.finance1,ids.lab]);
    await pool.query("INSERT INTO order_items(id,order_id,test_id,price_kobo) VALUES($1,$2,$3,10000)",
      [ids.item,ids.order,ids.test]);
    await pool.query("INSERT INTO specimens(id,order_id,barcode,status) VALUES($1,$2,$3,'lab_received')",
      [ids.specimen,ids.order,'SYN-APPROVAL-'+ids.specimen]);
    await pool.query(`INSERT INTO payments(id,order_id,provider_reference,amount_kobo,status)
      VALUES($1,$2,$3,10000,'paid')`,
      [ids.payment,ids.order,'syn-approval-'+ids.payment]);
    await pool.query(`INSERT INTO results(id,order_id,patient_id,object_key,released_at,released_by)
      VALUES($1,$2,$3,$4,now(),$5)`,
      [ids.result,ids.order,ids.patient,'synthetic/results/'+ids.intake+'.pdf',ids.finance1]);
    await pool.query(`INSERT INTO phase4_result_intakes
      (result_id,order_item_id,specimen_id,lab_id,intake_key,intake_fingerprint,
       document_sha256,validation_reference,intake_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ids.result,ids.item,ids.specimen,ids.lab,ids.intake,
        'a'.repeat(64),'b'.repeat(64),'SYN-VALIDATED-0001',ids.finance1]);
    await pool.query(`
      INSERT INTO phase4_result_release_events(result_id,release_key,released_by)
      VALUES($1,$2,$3)`,[ids.result,randomUUID(),ids.finance1]);
    access=new AccessService();
    refunds=new Phase4RefundService(access);
    settlements=new Phase4LabSettlementsService(access);
  });
  afterAll(async()=>{
    if(previous===undefined)delete process.env.FISHER_PHASE4_OPERATION_MODE;
    else process.env.FISHER_PHASE4_OPERATION_MODE=previous;
    await refunds?.onModuleDestroy();
    await settlements?.onModuleDestroy();
    await access?.onModuleDestroy();
    await pool?.end();
  });
  it('creates bounded refund requests and refuses over-allocation',async()=>{
    const input={paymentId:ids.payment,requestKey:ids.refundKey,
      amountKobo:6000,reasonCode:'failed_collection' as const};
    await expect(refunds.request(identity(subjectA,false),input)).rejects.toThrow();
    const one=await refunds.request(identity(subjectA),input);
    refundId=one.data.id;
    expect(one.data).toMatchObject({status:'pending',providerRefundExecuted:false});
    expect((await refunds.request(identity(subjectA),input)).data.replayed).toBe(true);
    await expect(refunds.request(identity(subjectA),{
      ...input,requestKey:randomUUID(),amountKobo:5000
    })).rejects.toThrow();
  });
  it('enforces distinct reviewers and immutable refund decisions',async()=>{
    await expect(refunds.review(identity(subjectA),refundId,'approve',
      'Reviewed collected fee')).rejects.toThrow();
    const one=await refunds.review(identity(subjectB),refundId,'approve',
      'Reviewed collected fee');
    expect(one.data).toMatchObject({status:'approved',providerRefundExecuted:false});
    expect((await refunds.review(identity(subjectB),refundId,'approve',
      'Reviewed collected fee')).data.replayed).toBe(true);
    await pool.query("UPDATE payments SET status='refunded' WHERE id=$1",[ids.payment]);
    expect((await refunds.request(identity(subjectA),{
      paymentId:ids.payment,requestKey:ids.refundKey,
      amountKobo:6000,reasonCode:'failed_collection'
    })).data.replayed).toBe(true);
    expect((await refunds.review(identity(subjectB),refundId,'approve',
      'Reviewed collected fee')).data.replayed).toBe(true);
    await pool.query("UPDATE payments SET status='paid' WHERE id=$1",[ids.payment]);
    await expect(refunds.review(identity(subjectB),refundId,'reject',
      'Reviewed collected fee')).rejects.toThrow();
  });
  it('refuses approval when a paid payment has independently changed state',async()=>{
    const key=randomUUID();
    const request=await refunds.request(identity(subjectA),{
      paymentId:ids.payment,requestKey:key,amountKobo:100,
      reasonCode:'manual_review'
    });
    await pool.query("UPDATE payments SET status='refunded' WHERE id=$1",[ids.payment]);
    await expect(refunds.review(identity(subjectB),request.data.id,'approve',
      'Payment reversal independently checked')).rejects.toThrow();
    const state=await pool.query<{status:string}>(`
      SELECT status FROM phase4_refund_requests WHERE id=$1`,[request.data.id]);
    expect(state.rows[0]?.status).toBe('pending');
    await pool.query("UPDATE payments SET status='paid' WHERE id=$1",[ids.payment]);
    const declined=await refunds.review(identity(subjectB),request.data.id,'reject',
      'Payment reversal independently checked');
    expect(declined.data.status).toBe('rejected');
  });
  it('records payable from a released, paid result, never from the customer list price',async()=>{
    const p={resultId:ids.result,amountKobo:2500,agreementReference:'SYN-AGREEMENT-0001'};
    await pool.query("UPDATE payments SET status='pending' WHERE id=$1",[ids.payment]);
    await expect(settlements.addPayable(identity(subjectA),p)).rejects.toThrow();
    await pool.query("UPDATE payments SET status='paid' WHERE id=$1",[ids.payment]);
    // A timestamp alone is not independently verifiable release evidence.
    // The event is immutable; temporarily remove it only in this disposable
    // test before any payable/settlement has been recorded.
    await expect(pool.query(`
      DELETE FROM phase4_result_release_events WHERE result_id=$1`,
      [ids.result])).rejects.toThrow();
    const one=await settlements.addPayable(identity(subjectA),p);
    payableId=one.data.id;
    expect(one.data.payoutExecuted).toBe(false);
    expect((await settlements.addPayable(identity(subjectA),p)).data.replayed).toBe(true);
    await expect(settlements.addPayable(identity(subjectA),{
      ...p,amountKobo:2600
    })).rejects.toThrow();
  });
  it('makes second-person settlement review mandatory and preserves no-payout truth',async()=>{
    const request={batchKey:ids.batchKey,labId:ids.lab,payableIds:[payableId]};
    const batch=await settlements.propose(identity(subjectA),request);
    expect(batch.data).toMatchObject({status:'pending',payoutExecuted:false});
    await expect(settlements.review(identity(subjectA),batch.data.id,'approve',
      'Agreement independently checked')).rejects.toThrow();
    const declined=await settlements.review(identity(subjectB),batch.data.id,'reject',
      'Agreement independently checked');
    expect(declined.data).toMatchObject({status:'rejected',payoutExecuted:false});
    const retryKey=randomUUID();
    const retry=await settlements.propose(identity(subjectA),{
      ...request,batchKey:retryKey
    });
    await pool.query('UPDATE laboratories SET active=false WHERE id=$1',[ids.lab]);
    await expect(settlements.review(identity(subjectB),retry.data.id,'approve',
      'Agreement independently checked')).rejects.toThrow();
    const stillPending=await pool.query<{status:string}>(`
      SELECT status FROM phase4_lab_settlement_batches WHERE id=$1`,[retry.data.id]);
    expect(stillPending.rows[0]?.status).toBe('pending');
    await pool.query('UPDATE laboratories SET active=true WHERE id=$1',[ids.lab]);
    await pool.query("UPDATE payments SET status='refunded' WHERE id=$1",[ids.payment]);
    await expect(settlements.review(identity(subjectB),retry.data.id,'approve',
      'Agreement independently checked')).rejects.toThrow();
    await pool.query("UPDATE payments SET status='paid' WHERE id=$1",[ids.payment]);
    const approved=await settlements.review(identity(subjectB),retry.data.id,'approve',
      'Agreement independently checked');
    expect(approved.data).toMatchObject({status:'approved',payoutExecuted:false});
    await pool.query('UPDATE laboratories SET active=false WHERE id=$1',[ids.lab]);
    expect((await settlements.propose(identity(subjectA),{
      ...request,batchKey:retryKey
    })).data.replayed).toBe(true);
    expect((await settlements.review(identity(subjectB),retry.data.id,'approve',
      'Agreement independently checked')).data.replayed).toBe(true);
    await pool.query('UPDATE laboratories SET active=true WHERE id=$1',[ids.lab]);
    // Persisted accounting evidence cannot be silently rewritten even by a
    // future service bug or administrator using direct SQL.
    await expect(pool.query(`
      UPDATE phase4_refund_requests SET amount_kobo=amount_kobo+1 WHERE id=$1`,
      [refundId])).rejects.toThrow();
    await expect(pool.query(`
      UPDATE phase4_lab_payables SET amount_kobo=amount_kobo+1 WHERE id=$1`,
      [payableId])).rejects.toThrow();
    await expect(pool.query(`
      UPDATE phase4_lab_settlement_batches SET total_kobo=total_kobo+1 WHERE id=$1`,
      [retry.data.id])).rejects.toThrow();
    await expect(pool.query(`
      UPDATE phase4_lab_payables SET assigned_batch=NULL WHERE id=$1`,
      [payableId])).rejects.toThrow();
    await expect(settlements.propose(identity(subjectA),{
      ...request,batchKey:randomUUID()
    })).rejects.toThrow();
  });
});
