import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../access.service';
import { Phase3DispatchService } from './dispatch.service';
import { Phase3CustodyService } from './custody.service';
import { Phase3AssignmentEventsService } from './assignment-events.controller';
import { Phase3HandoffService } from './handoffs.controller';
import { Phase3IncidentsService } from './incidents.controller';
import { Phase3ManifestService } from './manifests.controller';

const previousPhase3Mode = process.env.FISHER_PHASE3_OPERATION_MODE;
const suite = process.env.FISHER_DISPOSABLE_DB_ACK === 'disposable-test-only' && process.env.DATABASE_URL
  ? describe : describe.skip;
suite.sequential('Phase 3 full custody workflow (disposable PostgreSQL only)', () => {
  let pool: Pool, access: AccessService, dispatch: Phase3DispatchService;
  let custody: Phase3CustodyService, handoffs: Phase3HandoffService;
  let assignmentEvents: Phase3AssignmentEventsService;
  let incidents: Phase3IncidentsService, manifests: Phase3ManifestService;
  const ids = {
    owner: randomUUID(), collector: randomUUID(), courier: randomUUID(),
    outsider: randomUUID(), dispatcher: randomUUID(), labWorker: randomUUID(),
    patient: randomUUID(), lab: randomUUID(), order: randomUUID(), competingOrder: randomUUID(),
    zone: randomUUID(), slot: randomUUID(),
    shift: randomUUID(), specimenA: randomUUID(), specimenB: randomUUID(),
    collectorStaff: randomUUID(), courierStaff: randomUUID(), outsiderStaff: randomUUID(),
    dispatcherStaff: randomUUID(), labStaff: randomUUID()
  };
  const subs = {
    collector: 'synthetic-collector-' + randomUUID(),
    courier: 'synthetic-courier-' + randomUUID(),
    outsider: 'synthetic-courier-outsider-' + randomUUID(),
    dispatcher: 'synthetic-dispatcher-' + randomUUID(),
    labWorker: 'synthetic-lab-worker-' + randomUUID()
  };
  const identity = (subject: string, mfa = true) => ({
    subject, issuer: 'https://identity.fisher.test',
    authenticationMethods: mfa ? ['mfa'] : []
  });
  let assignmentId: string, offerId: string, manifestId: string;
  const receiptKey = randomUUID();

  beforeAll(async () => {
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    if (!process.env.DATABASE_URL || process.env.FISHER_DISPOSABLE_DB_ACK !== 'disposable-test-only') {
      throw new Error('Disposable synthetic PostgreSQL acknowledgment required');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const identityCheck = await pool.query<{ name: string }>('SELECT current_database() AS name');
    if (identityCheck.rows[0]?.name !== 'fisher_test')
      throw new Error('Refusing Phase 3 integration test outside fisher_test');
    const registry = await pool.query<{ table: string | null }>(
      "SELECT to_regclass('public.phase3_handoff_specimens')::text AS table");
    if (!registry.rows[0]?.table) throw new Error('Phase 3 0017-0020 migrations must be applied');
    const phase2 = await pool.query<{ name: string | null }>(
      "SELECT to_regclass('public.collection_slots')::text AS name");
    if (!phase2.rows[0]?.name)
      throw new Error('Merged Phase 2 migrations through 0016 are required before Phase 3 tests');
    const { owner,collector,courier,outsider,dispatcher,labWorker,patient,lab,order,
      shift,specimenA,specimenB,collectorStaff,courierStaff,outsiderStaff,dispatcherStaff,labStaff } = ids;
    await pool.query(
      'INSERT INTO users(id,identity_subject) VALUES ' +
      '($1,$2),($3,$4),($5,$6),($7,$8),($9,$10),($11,$12)',
      [owner,'synthetic-owner-' + randomUUID(),collector,subs.collector,
        courier,subs.courier,outsider,subs.outsider,
        dispatcher,subs.dispatcher,labWorker,subs.labWorker]);
    await pool.query('INSERT INTO patients(id,display_name) VALUES($1,$2)', [patient,'Synthetic Handoff Patient']);
    await pool.query('INSERT INTO laboratories(id,name,active) VALUES($1,$2,true)', [lab,'Synthetic Lab']);
    await pool.query(
      'INSERT INTO staff(id,user_id,role,active) VALUES ' +
      "($1,$2,'phlebotomist',true),($3,$4,'courier',true),($5,$6,'courier',true)," +
      "($7,$8,'dispatcher',true),($9,$10,'lab_coordinator',true)",
      [collectorStaff,collector,courierStaff,courier,outsiderStaff,outsider,
        dispatcherStaff,dispatcher,labStaff,labWorker]);
    const now = Date.now();
    await pool.query(
      'INSERT INTO phase3_staff_shifts(id,staff_id,zone_code,starts_at,ends_at) ' +
      'VALUES($1,$2,$3,$4,$5)',
      [shift,collectorStaff,'synthetic-lagos-zone',
        new Date(now + 60 * 60_000),new Date(now + 6 * 60 * 60_000)]);
    await pool.query(
      'INSERT INTO service_zones(id,code,name,active,regular_fee_kobo,premium_fee_kobo) ' +
      'VALUES($1,$2,$3,true,0,0)',
      [ids.zone,'synthetic-lagos-zone','Synthetic Dispatch Zone']);
    await pool.query(
      'INSERT INTO collection_slots(id,zone_id,lab_id,tier,starts_at,ends_at,cutoff_at,capacity,active) ' +
      "VALUES($1,$2,$3,'regular',$4,$5,$6,2,true)",
      [ids.slot,ids.zone,lab,
        new Date(now + 2 * 60 * 60_000),new Date(now + 3 * 60 * 60_000),
        new Date(now + 60 * 60_000)]);
    await pool.query(
      'INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo,' +
      'slot_id,collection_window_start,collection_window_end) ' +
      "VALUES($1,$2,$3,$4,'confirmed','regular',0,$5,$6,$7)," +
      "($8,$2,$3,$4,'confirmed','regular',0,$5,$6,$7)",
      [order,patient,owner,lab,ids.slot,
        new Date(now + 2 * 60 * 60_000),new Date(now + 3 * 60 * 60_000),
        ids.competingOrder]);
    await pool.query('INSERT INTO specimens(id,order_id,barcode) VALUES($1,$3,$4),($2,$3,$5)',
      [specimenA,specimenB,order,'syn-' + randomUUID(),'syn-' + randomUUID()]);
    access = new AccessService();
    dispatch = new Phase3DispatchService(access);
    custody = new Phase3CustodyService(access);
    assignmentEvents = new Phase3AssignmentEventsService(access);
    handoffs = new Phase3HandoffService(access);
    incidents = new Phase3IncidentsService(access);
    await pool.query(
      'INSERT INTO phase3_lab_staff_access(lab_id,staff_id,granted_by,active) ' +
      'VALUES($1,$2,$3,true)',
      [lab,labStaff,dispatcher]);
    manifests = new Phase3ManifestService(access);
  });

  afterAll(async () => {
    if (previousPhase3Mode === undefined) delete process.env.FISHER_PHASE3_OPERATION_MODE;
    else process.env.FISHER_PHASE3_OPERATION_MODE = previousPhase3Mode;
    await Promise.all([dispatch?.onModuleDestroy(),custody?.onModuleDestroy(),
      handoffs?.onModuleDestroy(),incidents?.onModuleDestroy(),
      assignmentEvents?.onModuleDestroy(),
      manifests?.onModuleDestroy(),access?.onModuleDestroy()]);
    await pool?.end();
    // All synthetic fixture data intentionally remains in the disposable DB.
  });

  it('assigns only a confirmed order to the eligible on-shift collector', async () => {
    await expect(dispatch.assign(identity(subs.collector),ids.order,ids.collectorStaff,ids.shift))
      .rejects.toThrow();
    const assigned = await dispatch.assign(
      identity(subs.dispatcher),ids.order,ids.collectorStaff,ids.shift);
    assignmentId = assigned.data.id;
    expect(assigned.data.status).toBe('assigned');
    const arrivedKey = randomUUID();
    const arrived = await assignmentEvents.apply(identity(subs.collector),assignmentId,
      arrivedKey,{action:'arrive',expectedVersion:0});
    expect(arrived.data).toMatchObject({status:'arrived',version:1,replayed:false});
    expect((await assignmentEvents.apply(identity(subs.collector),assignmentId,
      arrivedKey,{action:'arrive',expectedVersion:0})).data.replayed).toBe(true);
    const collecting = await assignmentEvents.apply(identity(subs.collector),assignmentId,
      randomUUID(),{action:'start_collection',expectedVersion:1});
    expect(collecting.data).toMatchObject({status:'collecting',version:2});
    await expect(dispatch.assign(identity(subs.dispatcher),ids.competingOrder,ids.collectorStaff,ids.shift))
      .rejects.toThrow('Staff shift not eligible');
  });

  it('requires current collector assignment and protects custody handoff commands', async () => {
    await expect(custody.apply(identity(subs.collector,false), ids.specimenA,
      { eventId: randomUUID(), action: 'collect', expectedVersion: 0 })).rejects.toThrow();
    await expect(custody.apply(identity(subs.courier), ids.specimenA,
      { eventId: randomUUID(), action: 'collect', expectedVersion: 0 })).rejects.toThrow();
    await expect(custody.apply(identity(subs.collector), ids.specimenA,
      { eventId: randomUUID(), action: 'dispatch', expectedVersion: 0,
        recipientId:ids.courier,recipientAcknowledged:true })).rejects.toThrow();
    for (const specimenId of [ids.specimenA,ids.specimenB]) {
      expect((await custody.apply(identity(subs.collector),specimenId,
        { eventId: randomUUID(), action: 'collect', expectedVersion: 0 })).data.state).toBe('collected');
      expect((await custody.apply(identity(subs.collector),specimenId,
        { eventId: randomUUID(), action: 'package', expectedVersion: 1 })).data.state).toBe('packaged');
    }
  });

  it('records a collector incident idempotently and blocks unresolved handoff', async () => {
    const key = randomUUID();
    const first = await incidents.report(identity(subs.collector),ids.specimenA,key,'broken_seal');
    expect(first.data.replayed).toBe(false);
    const second = await incidents.report(identity(subs.collector),ids.specimenA,key,'broken_seal');
    expect(second.data).toEqual({ ...first.data,replayed:true });
    await expect(incidents.report(identity(subs.collector),ids.specimenB,key,'broken_seal'))
      .rejects.toThrow('Incident event identity reused');
    await expect(handoffs.offer(identity(subs.collector),assignmentId,ids.courierStaff,randomUUID()))
      .rejects.toThrow('Open specimen incident blocks handoff');
    await incidents.resolve(identity(subs.dispatcher),first.data.id,'Reviewed synthetic seal integrity');
  });

  it('requires the designated courier to acknowledge the frozen specimen set', async () => {
    const key = randomUUID();
    const first = await handoffs.offer(identity(subs.collector),assignmentId,ids.courierStaff,key);
    offerId = first.data.id;
    expect(first.data.specimenCount).toBe(2);
    const replay = await handoffs.offer(identity(subs.collector),assignmentId,ids.courierStaff,key);
    expect(replay.data.replayed).toBe(true);
    await expect(handoffs.acknowledge(identity(subs.outsider),offerId,receiptKey)).rejects.toThrow();
    await expect(handoffs.acknowledge(identity(subs.courier,false),offerId,receiptKey)).rejects.toThrow();
    const accepted = await handoffs.acknowledge(identity(subs.courier),offerId,receiptKey);
    expect(accepted.data).toMatchObject({ status:'received',specimenCount:2,replayed:false });
    expect((await handoffs.acknowledge(identity(subs.courier),offerId,receiptKey)).data.replayed).toBe(true);
    expect((await handoffs.offer(identity(subs.collector),assignmentId,ids.courierStaff,key)).data.replayed)
      .toBe(true);
    await expect(handoffs.acknowledge(identity(subs.courier),offerId,randomUUID()))
      .rejects.toThrow('Handoff already finalized');
    const after = await pool.query<{ status:string; custody_version:number }>(
      'SELECT status,custody_version FROM specimens WHERE order_id=$1', [ids.order]);
    expect(after.rows).toHaveLength(2);
    expect(after.rows.every(x => x.status === 'in_transit' && x.custody_version === 3)).toBe(true);
  });

  it('allows scoped courier incidents, then reconciles lab receipt after resolution', async () => {
    const reported = await incidents.report(identity(subs.courier),ids.specimenB,
      randomUUID(),'transport_delay');
    await expect(manifests.prepare(identity(subs.dispatcher),ids.lab,
      [ids.specimenA,ids.specimenB])).rejects.toThrow('Manifest specimens not eligible');
    await incidents.resolve(identity(subs.dispatcher),reported.data.id,'Reviewed synthetic transport delay');
    const prepared = await manifests.prepare(identity(subs.dispatcher),ids.lab,[ids.specimenA,ids.specimenB]);
    manifestId = prepared.data.id;
    const accepted = await manifests.receive(identity(subs.labWorker),manifestId,randomUUID(),
      [ids.specimenA,ids.specimenB],[]);
    expect(accepted.data).toMatchObject({ status:'received',replayed:false });
    const after = await pool.query<{ status:string; custody_version:number }>(
      'SELECT status,custody_version FROM specimens WHERE order_id=$1', [ids.order]);
    expect(after.rows.every(x => x.status === 'lab_received' && x.custody_version === 4)).toBe(true);
  });

  it('allows exactly one overlapping assignment across competing requests', async () => {
    const workerUser = randomUUID();
    const workerStaff = randomUUID();
    const workerShift = randomUUID();
    const firstOrder = randomUUID();
    const secondOrder = randomUUID();
    const now = Date.now();
    await pool.query('INSERT INTO users(id,identity_subject) VALUES($1,$2)',
      [workerUser,'synthetic-concurrent-collector-' + randomUUID()]);
    await pool.query("INSERT INTO staff(id,user_id,role,active) VALUES($1,$2,'phlebotomist',true)",
      [workerStaff,workerUser]);
    await pool.query(
      'INSERT INTO phase3_staff_shifts(id,staff_id,zone_code,starts_at,ends_at) ' +
      'VALUES($1,$2,$3,$4,$5)',
      [workerShift,workerStaff,'synthetic-lagos-zone',
        new Date(now - 60 * 60_000),new Date(now + 24 * 60 * 60_000)]);
    // Both orders use the same valid Phase 2 slot and overlap.
    await pool.query(
      'INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo,' +
      'slot_id,collection_window_start,collection_window_end) ' +
      "SELECT x.id,$2,$3,$4,'confirmed','regular',0,$5,s.starts_at,s.ends_at " +
      'FROM unnest($1::uuid[]) AS x(id) CROSS JOIN collection_slots s WHERE s.id=$5',
      [[firstOrder,secondOrder],ids.patient,ids.owner,ids.lab,ids.slot]);
    const outcomes = await Promise.allSettled([
      dispatch.assign(identity(subs.dispatcher),firstOrder,workerStaff,workerShift),
      dispatch.assign(identity(subs.dispatcher),secondOrder,workerStaff,workerShift)
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    const saved = await pool.query<{ id: string }>(
      'SELECT id FROM phase3_assignments WHERE order_id=ANY($1::uuid[])',
      [[firstOrder,secondOrder]]);
    expect(saved.rowCount).toBe(1);
  });
});
