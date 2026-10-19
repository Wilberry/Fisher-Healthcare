import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../access.service';
import { Phase3LabAccessService } from './lab-access.controller';

const suite = process.env.FISHER_DISPOSABLE_DB_ACK === 'disposable-test-only' &&
  process.env.DATABASE_URL ? describe : describe.skip;

suite.sequential('Phase 3 two-person lab grant review (disposable PostgreSQL)', () => {
  const previousMode = process.env.FISHER_PHASE3_OPERATION_MODE;
  let pool: Pool, access: AccessService, grants: Phase3LabAccessService;
  const requester = randomUUID(), reviewer = randomUUID(), receiver = randomUUID();
  const staffRequester = randomUUID(), staffReviewer = randomUUID(), staffReceiver = randomUUID();
  const lab = randomUUID();
  const identity = (subject:string, mfa=true) => ({
    subject,issuer:'https://identity.fisher.test',
    authenticationMethods:mfa? ['mfa']: []
  });
  const names = {
    requester: 'synthetic-grant-request-' + randomUUID(),
    reviewer: 'synthetic-grant-review-' + randomUUID(),
    receiver: 'synthetic-lab-receiver-' + randomUUID()
  };
  let requestId:string;

  beforeAll(async () => {
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    if (!process.env.DATABASE_URL || process.env.FISHER_DISPOSABLE_DB_ACK !== 'disposable-test-only') {
      throw new Error('Disposable synthetic PostgreSQL acknowledgment required');
    }
    pool = new Pool({connectionString:process.env.DATABASE_URL});
    const db = await pool.query<{name:string}>('SELECT current_database() AS name');
    if (db.rows[0]?.name !== 'fisher_test') {
      throw new Error('Lab access tests refuse non-disposable database');
    }
    const reg = await pool.query<{name:string|null}>(
      "SELECT to_regclass('public.phase3_lab_access_requests')::text AS name");
    if (!reg.rows[0]?.name) throw new Error('Phase 3 lab access migrations not applied');
    await pool.query(
      'INSERT INTO users(id,identity_subject) VALUES ($1,$2),($3,$4),($5,$6)',
      [requester,names.requester,reviewer,names.reviewer,receiver,names.receiver]);
    await pool.query(
      'INSERT INTO staff(id,user_id,role,active) VALUES ' +
      "($1,$2,'administrator',true),($3,$4,'administrator',true)," +
      "($5,$6,'lab_coordinator',true)",
      [staffRequester,requester,staffReviewer,reviewer,staffReceiver,receiver]);
    await pool.query('INSERT INTO laboratories(id,name,active) VALUES ($1,$2,true)',
      [lab,'Synthetic Grant Review Lab']);
    access=new AccessService();
    grants=new Phase3LabAccessService(access);
  });

  afterAll(async () => {
    if (previousMode === undefined) delete process.env.FISHER_PHASE3_OPERATION_MODE;
    else process.env.FISHER_PHASE3_OPERATION_MODE = previousMode;
    await grants?.onModuleDestroy();
    await access?.onModuleDestroy();
    await pool?.end();
  });

  it('requires MFA, the proper role and an eligible coordinator', async () => {
    await expect(grants.request(identity(names.requester,false),lab,staffReceiver,
      'Synthetic clinic onboarding')).rejects.toThrow();
    await expect(grants.request(identity(names.receiver),lab,staffReceiver,
      'Synthetic clinic onboarding')).rejects.toThrow();
    await expect(grants.request(identity(names.requester),lab,staffRequester,
      'Synthetic invalid target')).rejects.toThrow('Lab or coordinator not eligible');
  });

  it('keeps duplicate pending requests non-authorizing', async () => {
    const opened=await grants.request(identity(names.requester),lab,staffReceiver,
      'Verified internal lab coordinator');
    requestId=opened.data.id;
    expect(opened.data.status).toBe('pending');
    await expect(grants.request(identity(names.requester),lab,staffReceiver,
      'Verified internal lab coordinator')).rejects.toThrow('Pending lab access request already exists');
    const scope=await pool.query(
      'SELECT staff_id FROM phase3_lab_staff_access WHERE lab_id=$1 AND staff_id=$2',
      [lab,staffReceiver]);
    expect(scope.rowCount).toBe(0);
  });

  it('requires a different active administrator to approve', async () => {
    await expect(grants.approve(identity(names.requester),requestId))
      .rejects.toThrow('A second administrator must approve');
    const approved=await grants.approve(identity(names.reviewer),requestId);
    expect(approved.data.status).toBe('approved');
    await expect(grants.approve(identity(names.reviewer),requestId))
      .rejects.toThrow('Grant request unavailable');
    const scope=await pool.query<{active:boolean;granted_by:string}>(
      'SELECT active,granted_by FROM phase3_lab_staff_access WHERE lab_id=$1 AND staff_id=$2',
      [lab,staffReceiver]);
    expect(scope.rows[0]).toEqual({active:true,granted_by:reviewer});
  });

  it('revokes immediately and records the operation in the audit log', async () => {
    const revoked=await grants.revoke(identity(names.requester),lab,staffReceiver);
    expect(revoked.data.status).toBe('revoked');
    const scope=await pool.query<{active:boolean;revoked_at:Date|null}>(
      'SELECT active,revoked_at FROM phase3_lab_staff_access WHERE lab_id=$1 AND staff_id=$2',
      [lab,staffReceiver]);
    expect(scope.rows[0]?.active).toBe(false);
    expect(scope.rows[0]?.revoked_at).not.toBeNull();
    await expect(grants.revoke(identity(names.requester),lab,staffReceiver))
      .rejects.toThrow('Active lab access not found');
    const audits=await pool.query<{action:string}>(
      "SELECT action FROM audit_events WHERE resource_type='lab_access_request' " +
      "AND resource_id=$1 ORDER BY occurred_at", [requestId]);
    expect(audits.rows.map(row=>row.action)).toContain('phase3.lab_access.approved');
  });
});
