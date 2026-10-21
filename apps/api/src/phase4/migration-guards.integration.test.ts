import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only'&&
  process.env.DATABASE_URL?describe:describe.skip;
suite.sequential('Phase 4 schema and immutable evidence (disposable PostgreSQL)',()=>{
  let pool:Pool;
  beforeAll(async()=>{
    if(!process.env.DATABASE_URL||process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')
      throw new Error('Disposable database acknowledgment required');
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
    const identity=await pool.query<{db:string}>('SELECT current_database() AS db');
    if(identity.rows[0]?.db!=='fisher_test')throw new Error('Refusing a non-test database');
  });
  afterAll(async()=>{await pool?.end();});
  it('applies all eight new checksummed migrations in sequence',async()=>{
    const sql=`SELECT version,sha256 FROM fisher_migrations
      WHERE version LIKE '0026_%' OR version LIKE '0027_%'
        OR version LIKE '0028_%' OR version LIKE '0029_%'
        OR version LIKE '0030_%' OR version LIKE '0031_%'
        OR version LIKE '0032_%'
        OR version LIKE '0033_%'
      ORDER BY version`;
    const applied=await pool.query<{version:string;sha256:string}>(sql);
    expect(applied.rows).toHaveLength(8);
    expect(applied.rows.map(v=>v.version.slice(0,4))).toEqual([
      '0026','0027','0028','0029','0030','0031','0032','0033'
    ]);
    expect(applied.rows.every(v=>/^[a-f0-9]{64}$/.test(v.sha256.trim()))).toBe(true);
  });
  it('has patient preferences, audited result/finance flows and review tables',async()=>{
    const names=[
      'phase4_result_intakes','phase4_result_release_events',
      'phase4_result_delivery_intents','phase4_result_email_preferences',
      'phase4_finance_reconciliation_runs','phase4_finance_reconciliation_items',
      'phase4_refund_requests','phase4_lab_settlement_batches',
      'phase4_lab_payables','phase4_lab_settlement_items'
    ];
    const r=await pool.query<{name:string|null}>(`
      SELECT to_regclass('public.'||names.name)::text AS name
      FROM unnest($1::text[]) WITH ORDINALITY AS names(name,position)
      ORDER BY names.position`,[names]);
    expect(r.rows).toHaveLength(names.length);
    expect(r.rows.every(v=>v.name!==null)).toBe(true);
  });
  it('retains immutable event triggers, review and delivery constraints',async()=>{
    const triggers=['phase4_result_intakes_immutable',
      'phase4_result_release_events_immutable',
      'phase4_reconciliation_runs_immutable',
      'phase4_reconciliation_items_immutable',
      'phase4_lab_batch_items_immutable',
      'phase4_refund_immutable_fields',
      'phase4_lab_batch_immutable_fields',
      'phase4_lab_payable_immutable_fields',
      'phase4_results_immutable'];
    const found=await pool.query<{name:string}>(`
      SELECT tgname AS name FROM pg_trigger
      WHERE tgname=ANY($1::text[]) AND NOT tgisinternal`,[triggers]);
    expect(found.rows.map(v=>v.name).sort()).toEqual([...triggers].sort());
    const constraints=['phase4_delivery_lease_pair','phase4_delivery_receipt_consistent',
      'phase4_refund_distinct_approver','phase4_lab_batch_distinct_review',
      'phase4_lab_batch_review','phase4_refund_review_consistency'];
    const actual=await pool.query<{name:string}>(`
      SELECT conname AS name FROM pg_constraint WHERE conname=ANY($1::text[])`,
      [constraints]);
    expect(actual.rows.map(v=>v.name).sort()).toEqual([...constraints].sort());
  });
});
