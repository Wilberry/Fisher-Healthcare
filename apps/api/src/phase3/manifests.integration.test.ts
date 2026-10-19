import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AccessService } from '../access.service';
import { Phase3ManifestService } from './manifests.controller';

const previousPhase3Mode = process.env.FISHER_PHASE3_OPERATION_MODE;
const suite = process.env.FISHER_DISPOSABLE_DB_ACK === 'disposable-test-only' && process.env.DATABASE_URL
  ? describe : describe.skip;
suite.sequential('Phase 3 lab manifest receipt (disposable PostgreSQL only)', () => {
  let pool: Pool;
  let access: AccessService;
  let manifests: Phase3ManifestService;
  const owner = randomUUID(), dispatcher = randomUUID(), coordinator = randomUUID();
  const dispatcherStaff = randomUUID(), coordinatorStaff = randomUUID();
  const patient = randomUUID(), lab = randomUUID(), order = randomUUID();
  const first = randomUUID(), second = randomUUID();
  const dispatcherSubject = 'synthetic-dispatch-' + randomUUID();
  const coordinatorSubject = 'synthetic-lab-' + randomUUID();
  const authenticatedDispatcher = {
    subject: dispatcherSubject, issuer: 'https://identity.fisher.test',
    authenticationMethods: ['mfa']
  };
  const authenticatedLab = {
    subject: coordinatorSubject, issuer: 'https://identity.fisher.test',
    authenticationMethods: ['mfa']
  };
  let manifestId: string;
  const receiptKey = randomUUID();

  beforeAll(async () => {
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    if (process.env.FISHER_DISPOSABLE_DB_ACK !== 'disposable-test-only' || !process.env.DATABASE_URL)
      throw new Error('Disposable test database required');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const identity = await pool.query<{ name: string }>('SELECT current_database() AS name');
    if (identity.rows[0]?.name !== 'fisher_test')
      throw new Error('Refusing Phase 3 integration tests outside fisher_test');
    const migrated = await pool.query<{ id: string }>(
      "SELECT to_regclass('public.phase3_manifest_receipts') AS id");
    if (!migrated.rows[0]?.id) throw new Error('Apply reviewed Phase 3 migrations first');
    await pool.query(
      'INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4),($5,$6)',
      [owner,'synthetic-owner-' + randomUUID(),dispatcher,dispatcherSubject,coordinator,coordinatorSubject]);
    await pool.query('INSERT INTO patients(id,display_name) VALUES($1,$2)', [patient,'Synthetic Lab Patient']);
    await pool.query('INSERT INTO laboratories(id,name,active) VALUES($1,$2,true)',
      [lab,'Synthetic Accredited Lab']);
    await pool.query(
      "INSERT INTO staff(id,user_id,role,active) VALUES($1,$2,'dispatcher',true),($3,$4,'lab_coordinator',true)",
      [dispatcherStaff,dispatcher,coordinatorStaff,coordinator]);
    await pool.query(
      "INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo) " +
      "VALUES($1,$2,$3,$4,'collected','regular',0)",
      [order,patient,owner,lab]);
    await pool.query(
      "INSERT INTO specimens(id,order_id,barcode,status,custody_version) " +
      "VALUES($1,$3,$4,'in_transit',3),($2,$3,$5,'in_transit',5)",
      [first,second,order,'syn-' + randomUUID(),'syn-' + randomUUID()]);
    await pool.query(
      'INSERT INTO phase3_lab_staff_access(lab_id,staff_id,granted_by,active) ' +
      'VALUES($1,$2,$3,true)',
      [lab,coordinatorStaff,dispatcher]);
    access = new AccessService();
    manifests = new Phase3ManifestService(access);
    const created = await manifests.prepare(authenticatedDispatcher, lab, [first, second]);
    manifestId = created.data.id;
  });

  afterAll(async () => {
    if (previousPhase3Mode === undefined) delete process.env.FISHER_PHASE3_OPERATION_MODE;
    else process.env.FISHER_PHASE3_OPERATION_MODE = previousPhase3Mode;
    await manifests?.onModuleDestroy();
    await access?.onModuleDestroy();
    await pool?.end();
    // Fixture rows deliberately remain inside the disposable synthetic DB.
  });

  it('enforces lab-specific manifest visibility and avoids patient data', async () => {
    const dispatcherManifests = await manifests.list(authenticatedDispatcher);
    expect(dispatcherManifests.data.some(x => x.id === manifestId)).toBe(true);
    const ownManifests = await manifests.list(authenticatedLab);
    expect(ownManifests.data.some(x => x.id === manifestId)).toBe(true);
    const detail = await manifests.detail(authenticatedLab, manifestId);
    expect(detail.data.specimens).toHaveLength(2);
    expect(detail.data).not.toHaveProperty('patient_id');
    expect(detail.data.specimens.every(x => !('patient_id' in x))).toBe(true);
    await pool.query(
      'UPDATE phase3_lab_staff_access SET active=false,revoked_at=now() ' +
      'WHERE lab_id=$1 AND staff_id=$2',[lab,coordinatorStaff]);
    expect((await manifests.list(authenticatedLab)).data.some(x=>x.id===manifestId)).toBe(false);
    await expect(manifests.detail(authenticatedLab,manifestId))
      .rejects.toThrow('Manifest view denied');
    await pool.query(
      'UPDATE phase3_lab_staff_access SET active=true,revoked_at=NULL ' +
      'WHERE lab_id=$1 AND staff_id=$2',[lab,coordinatorStaff]);
  });

  it('denies coordinators whose current lab scope is missing or revoked', async () => {
    await pool.query('UPDATE phase3_lab_staff_access SET active=false,revoked_at=now() ' +
      'WHERE lab_id=$1 AND staff_id=$2',[lab,coordinatorStaff]);
    await expect(manifests.receive(authenticatedLab,manifestId,receiptKey,
      [first,second],[])).rejects.toThrow('Receiving lab staff not authorized');
    await pool.query('UPDATE phase3_lab_staff_access SET active=true,revoked_at=NULL ' +
      'WHERE lab_id=$1 AND staff_id=$2',[lab,coordinatorStaff]);
  });

  it('denies an unauthenticated or wrong-role lab receiver', async () => {
    await expect(manifests.receive({ ...authenticatedLab, authenticationMethods: [] },
      manifestId, receiptKey, [first, second], [])).rejects.toThrow();
    await expect(manifests.receive(authenticatedDispatcher, manifestId,
      receiptKey, [first, second], [])).rejects.toThrow();
  });

  it('rejects a missing specimen without partially advancing custody', async () => {
    await expect(manifests.receive(authenticatedLab, manifestId, receiptKey,
      [first], [])).rejects.toThrow('MANIFEST_RECEIPT_MISMATCH');
    const after = await pool.query<{ status: string }>(
      'SELECT status FROM specimens WHERE id=$1', [first]);
    expect(after.rows[0]?.status).toBe('in_transit');
  });

  it('atomically records a receipt, physical rejection, custody and audit trail', async () => {
    const result = await manifests.receive(authenticatedLab, manifestId, receiptKey,
      [first], [second], 'label_mismatch');
    expect(result.data).toEqual({ id: manifestId, status: 'disputed', replayed: false });
    const rows = await pool.query<{ id: string; status: string; custody_version: number }>(
      'SELECT id,status,custody_version FROM specimens WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[first,second]]);
    expect(rows.rows.find(x => x.id === first)).toMatchObject({ status: 'lab_received', custody_version: 4 });
    expect(rows.rows.find(x => x.id === second)).toMatchObject({ status: 'rejected', custody_version: 7 });
    const events = await pool.query<{ event_type: string }>(
      'SELECT event_type FROM custody_events WHERE specimen_id=ANY($1::uuid[])',
      [[first,second]]);
    expect(events.rows.filter(x => x.event_type === 'receive_at_lab')).toHaveLength(2);
    expect(events.rows.filter(x => x.event_type === 'reject')).toHaveLength(1);
    const audit = await pool.query(
      "SELECT id FROM audit_events WHERE resource_id=$1 AND action='phase3.lab_manifest.received'",
      [manifestId]);
    expect(audit.rowCount).toBe(1);
  });

  it('replays identical receipts without duplicating events, but rejects changed payloads', async () => {
    const replay = await manifests.receive(authenticatedLab, manifestId, receiptKey,
      [first], [second], 'label_mismatch');
    expect(replay.data.replayed).toBe(true);
    await expect(manifests.receive(authenticatedLab, manifestId, receiptKey,
      [second], [first], 'label_mismatch')).rejects.toThrow('Manifest receipt already finalized');
    await expect(manifests.receive(authenticatedLab, manifestId, randomUUID(),
      [first], [second], 'label_mismatch')).rejects.toThrow('Manifest receipt already finalized');
    const count = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM custody_events WHERE specimen_id=ANY($1::uuid[])',
      [[first,second]]);
    expect(Number(count.rows[0]?.count)).toBe(3);
  });
});
