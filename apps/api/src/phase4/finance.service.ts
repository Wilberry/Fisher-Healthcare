import { Injectable, OnModuleDestroy, ForbiddenException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {Pool} from 'pg';
import {AccessService} from '../access.service';
import {requireStaffMfa,type AuthenticatedIdentity} from '../identity';
import {requirePhase4SyntheticMode} from './phase4-mode';
import {reconciliationReason,type LedgerSnapshot} from './reconciliation-policy';

const ledgerSql=`
  SELECT p.id,p.status,p.amount_kobo,
    COALESCE(SUM(e.amount_kobo) FILTER (WHERE e.account='payment_clearing'),0)::text
      AS clearing_kobo,
    COALESCE(SUM(e.amount_kobo) FILTER (WHERE e.account='customer_receivable'),0)::text
      AS receivable_kobo,
    COUNT(e.id)::integer AS entry_count,
    COUNT(e.id) FILTER (WHERE e.account NOT IN
      ('payment_clearing','customer_receivable'))::integer AS other_count
  FROM payments p LEFT JOIN ledger_entries e ON e.transaction_id=p.id
  GROUP BY p.id,p.status,p.amount_kobo
  ORDER BY p.id`;

@Injectable()
export class Phase4FinanceService implements OnModuleDestroy{
  private readonly pool?:Pool;
  constructor(private readonly access:AccessService){
    if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
  }
  async onModuleDestroy(){await this.pool?.end();}
  private get db():Pool{
    if(!this.pool)throw new ServiceUnavailableException('Finance data unavailable');
    return this.pool;
  }
  async transactions(identity:AuthenticatedIdentity){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'finance:read');
    const r=await this.db.query<LedgerSnapshot>(ledgerSql+' LIMIT 100');
    return {data:r.rows.map(row=>({
      paymentId:row.id,status:row.status,amountKobo:row.amount_kobo,
      ledgerException:reconciliationReason(row)
    }))};
  }
  async runs(identity:AuthenticatedIdentity){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'finance:read');
    const r=await this.db.query(`
      SELECT id,checked_count,exception_count,created_at
      FROM phase4_finance_reconciliation_runs ORDER BY created_at DESC,id DESC LIMIT 50`);
    return {data:r.rows};
  }
  async reconcile(identity:AuthenticatedIdentity,runKey:string){
    requirePhase4SyntheticMode();
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject,'finance:manage');
    const c=await this.db.connect();
    try{
      // A consistent point-in-time snapshot prevents classifying one payment
      // against only half of its transactionally posted ledger entries.
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try{
        const actor=await c.query<{id:string}>(`
          SELECT u.id FROM users u JOIN staff st ON st.user_id=u.id
          WHERE u.identity_subject=$1 AND st.active
            AND st.role IN ('finance','administrator') FOR SHARE OF st`,[identity.subject]);
        const actorId=actor.rows[0]?.id;
        if(!actorId)throw new ForbiddenException('Finance reconciliation denied');
        const existing=await c.query<{id:string;checked_count:number;exception_count:number}>(`
          SELECT id,checked_count,exception_count FROM phase4_finance_reconciliation_runs
          WHERE run_key=$1`,[runKey]);
        if(existing.rows[0]){
          await c.query('COMMIT');
          return {data:{id:existing.rows[0].id,checkedCount:existing.rows[0].checked_count,
            exceptionCount:existing.rows[0].exception_count,replayed:true}};
        }
        const ledger=await c.query<LedgerSnapshot>(ledgerSql);
        const failures=ledger.rows.map(row=>({paymentId:row.id,reason:reconciliationReason(row)}))
          .filter((entry):entry is {paymentId:string;reason:NonNullable<typeof entry.reason>}=>
            entry.reason!==null);
        const run=await c.query<{id:string}>(`
          INSERT INTO phase4_finance_reconciliation_runs
            (run_key,run_by,checked_count,exception_count)
          VALUES($1,$2,$3,$4) RETURNING id`,
          [runKey,actorId,ledger.rows.length,failures.length]);
        const runId=run.rows[0]!.id;
        for(const failed of failures){
          await c.query(`
            INSERT INTO phase4_finance_reconciliation_items(run_id,payment_id,reason)
            VALUES($1,$2,$3)`,[runId,failed.paymentId,failed.reason]);
        }
        await c.query(`
          INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata)
          VALUES($1,'phase4.finance.reconciled','reconciliation_run',$2,$3::jsonb)`,
          [actorId,runId,JSON.stringify({checked:ledger.rows.length,exceptions:failures.length})]);
        await c.query('COMMIT');
        return {data:{id:runId,checkedCount:ledger.rows.length,
          exceptionCount:failures.length,replayed:false}};
      }catch(error){await c.query('ROLLBACK');throw error;}
    }catch(error){
      if(error&&typeof error==='object'&&'code' in error&&
          (error as {code:unknown}).code==='23505')
        throw new ConflictException('Reconciliation key already processed');
      throw error;
    }finally{c.release();}
  }
}
