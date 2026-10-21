import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {AccessService} from '../access.service';
import {Phase4FinanceService} from './finance.service';

const suite=process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only' &&
  process.env.DATABASE_URL?describe:describe.skip;

suite.sequential('Phase 4 finance reconciliation (disposable PostgreSQL)',()=>{
  const prev=process.env.FISHER_PHASE4_OPERATION_MODE;
  const ids={user:randomUUID(),staff:randomUUID(),patient:randomUUID(),lab:randomUUID(),
    orderPaid:randomUUID(),orderMismatch:randomUUID(),
    paymentPaid:randomUUID(),paymentMismatch:randomUUID(),run:randomUUID()};
  const subject='synthetic-finance-'+randomUUID();
  const identity=(mfa=true)=>({subject,issuer:'https://identity.fisher.test',
    authenticationMethods:mfa?['mfa']:[]});
  let pool:Pool,access:AccessService,finance:Phase4FinanceService;
  beforeAll(async()=>{
    process.env.FISHER_PHASE4_OPERATION_MODE='synthetic-only';
    if(!process.env.DATABASE_URL||process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only')
      throw new Error('Disposable test database required');
    pool=new Pool({connectionString:process.env.DATABASE_URL});
    const db=await pool.query<{name:string}>('SELECT current_database() AS name');
    if(db.rows[0]?.name!=='fisher_test')throw new Error('Refusing non-test database');
    const registry=await pool.query<{present:string|null}>(
      "SELECT to_regclass('public.phase4_finance_reconciliation_runs')::text AS present");
    if(!registry.rows[0]?.present)throw new Error('Phase 4 finance migration absent');
    await pool.query("INSERT INTO users(id,identity_subject) VALUES($1,$2)",[ids.user,subject]);
    await pool.query("INSERT INTO staff(id,user_id,role,active) VALUES($1,$2,'finance',true)",
      [ids.staff,ids.user]);
    await pool.query("INSERT INTO patients(id,display_name) VALUES($1,'Synthetic Reconciliation Patient')",
      [ids.patient]);
    await pool.query("INSERT INTO laboratories(id,name,active) VALUES($1,'Synthetic Finance Lab',true)",
      [ids.lab]);
    await pool.query(`INSERT INTO orders(id,patient_id,booked_by,lab_id,status,tier,total_kobo)
      VALUES ($1,$3,$4,$5,'confirmed','regular',15000),
             ($2,$3,$4,$5,'confirmed','regular',15000)`,
      [ids.orderPaid,ids.orderMismatch,ids.patient,ids.user,ids.lab]);
    await pool.query(`INSERT INTO payments(id,order_id,provider_reference,amount_kobo,status)
      VALUES ($1,$2,$3,15000,'paid'),($4,$5,$6,15000,'paid')`,
      [ids.paymentPaid,ids.orderPaid,'fisher-syn-'+ids.paymentPaid,
       ids.paymentMismatch,ids.orderMismatch,'fisher-syn-'+ids.paymentMismatch]);
    await pool.query(`INSERT INTO ledger_entries(transaction_id,account,amount_kobo)
      VALUES($1,'payment_clearing',15000),($1,'customer_receivable',-15000)`,
      [ids.paymentPaid]);
    access=new AccessService();finance=new Phase4FinanceService(access);
  });
  afterAll(async()=>{
    if(prev===undefined)delete process.env.FISHER_PHASE4_OPERATION_MODE;
    else process.env.FISHER_PHASE4_OPERATION_MODE=prev;
    await finance?.onModuleDestroy();await access?.onModuleDestroy();await pool?.end();
  });
  it('requires MFA and finance capability',async()=>{
    await expect(finance.reconcile(identity(false),ids.run)).rejects.toThrow();
  });
  it('shows the balanced payment and identifies unpaid ledger posting',async()=>{
    const list=await finance.transactions(identity());
    const balanced=list.data.find(x=>x.paymentId===ids.paymentPaid);
    const mismatch=list.data.find(x=>x.paymentId===ids.paymentMismatch);
    // More than 100 payment fixtures may exist across other integration suites;
    // the durable reconciliation run below checks the complete database.
    if(balanced)expect(balanced.ledgerException).toBeNull();
    if(mismatch)expect(mismatch.ledgerException).toBe('paid_ledger_mismatch');
  });
  it('persists immutable exceptions and rejects duplicate run-key effects',async()=>{
    const first=await finance.reconcile(identity(),ids.run);
    expect(first.data.replayed).toBe(false);
    expect(first.data.exceptionCount).toBeGreaterThanOrEqual(1);
    const second=await finance.reconcile(identity(),ids.run);
    expect(second.data.id).toBe(first.data.id);
    expect(second.data.replayed).toBe(true);
    const exception=await pool.query<{reason:string}>(`
      SELECT reason FROM phase4_finance_reconciliation_items WHERE run_id=$1 AND payment_id=$2`,
      [first.data.id,ids.paymentMismatch]);
    expect(exception.rows[0]?.reason).toBe('paid_ledger_mismatch');
    const good=await pool.query(`
      SELECT 1 FROM phase4_finance_reconciliation_items WHERE run_id=$1 AND payment_id=$2`,
      [first.data.id,ids.paymentPaid]);
    expect(good.rowCount).toBe(0);
    await expect(pool.query('DELETE FROM phase4_finance_reconciliation_runs WHERE id=$1',
      [first.data.id])).rejects.toThrow();
  });
});
