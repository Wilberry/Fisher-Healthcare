import { ConflictException, ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
@Injectable()
export class Phase3DispatchService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  }
  async onModuleDestroy() { await this.pool?.end(); }
  async assign(identity: AuthenticatedIdentity, orderId: string, staffId: string, shiftId: string) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ status: string }>(
        'SELECT status FROM orders WHERE id=$1 FOR UPDATE', [orderId]);
      if (order.rows[0]?.status !== 'confirmed') throw new ConflictException('Order not eligible for dispatch');
      const eligible = await client.query(
        `SELECT 1 FROM phase3_staff_shifts sh JOIN staff st ON st.id=sh.staff_id
         JOIN orders ord ON ord.id=$2
         WHERE sh.id=$1 AND sh.staff_id=$3 AND sh.active AND st.active
         AND st.role='phlebotomist'
         AND ord.collection_window_start >= sh.starts_at
         AND ord.collection_window_end <= sh.ends_at LIMIT 1`,
        [shiftId, orderId, staffId]);
      if (eligible.rowCount !== 1) throw new ForbiddenException('Staff shift not eligible');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO phase3_assignments(order_id,staff_id,shift_id)
         VALUES($1,$2,$3) RETURNING id`, [orderId, staffId, shiftId]);
      await client.query("UPDATE orders SET status='assigned',updated_at=now() WHERE id=$1", [orderId]);
      await client.query('COMMIT');
      return { data: { id: inserted.rows[0]!.id, orderId, staffId, status: 'assigned' } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
