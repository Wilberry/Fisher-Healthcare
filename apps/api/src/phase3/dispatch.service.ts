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
  async queue(identity: AuthenticatedIdentity) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      'SELECT ord.id,ord.lab_id,ord.tier,ord.collection_window_start,ord.collection_window_end, ' +
      'zone.code AS zone_code ' +
      'FROM orders ord JOIN collection_slots slot ON slot.id=ord.slot_id ' +
      'JOIN service_zones zone ON zone.id=slot.zone_id ' +
      'WHERE ord.status=$1 AND slot.active AND zone.active ' +
      'AND ord.collection_window_start IS NOT NULL ' +
      'AND ord.collection_window_end IS NOT NULL ' +
      "AND NOT EXISTS(SELECT 1 FROM phase3_assignments a WHERE a.order_id=ord.id " +
      "AND a.status IN ('assigned','arrived','collecting')) " +
      'ORDER BY ord.collection_window_start,id LIMIT 100', ['confirmed']);
    return { data: result.rows };
  }
  async list(identity: AuthenticatedIdentity) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      'SELECT a.id,a.order_id,a.staff_id,a.status,a.created_at,ord.collection_window_start,' +
      'ord.collection_window_end FROM phase3_assignments a ' +
      'JOIN orders ord ON ord.id=a.order_id ORDER BY a.created_at DESC LIMIT 100');
    return { data: result.rows };
  }

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
      // Lock both the staff and shift rows. Different overlapping shifts for the
      // same worker must serialize on the staff row before capacity decisions.
      const eligible = await client.query(
        "SELECT 1 FROM phase3_staff_shifts sh " +
        "JOIN staff st ON st.id=sh.staff_id " +
        "JOIN orders ord ON ord.id=$2 " +
        "JOIN collection_slots slot ON slot.id=ord.slot_id " +
        "JOIN service_zones zone ON zone.id=slot.zone_id " +
        "WHERE sh.id=$1 AND sh.staff_id=$3 AND sh.active AND st.active " +
        "AND st.role='phlebotomist' AND zone.active AND slot.active " +
        "AND sh.zone_code=zone.code " +
        "AND ord.collection_window_start >= sh.starts_at " +
        "AND ord.collection_window_end <= sh.ends_at " +
        "AND NOT EXISTS (" +
        " SELECT 1 FROM phase3_assignments a2 " +
        " JOIN orders o2 ON o2.id=a2.order_id " +
        " WHERE a2.staff_id=sh.staff_id " +
        " AND a2.status IN ('assigned','arrived','collecting') " +
        " AND tstzrange(o2.collection_window_start,o2.collection_window_end,'[)') " +
        " && tstzrange(ord.collection_window_start,ord.collection_window_end,'[)')" +
        ") FOR UPDATE OF sh,st",
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
