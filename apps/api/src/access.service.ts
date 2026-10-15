import { ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { hasCapability, type Capability, type StaffRole } from '@fisher/auth';

export const STAFF_CAPABILITIES: readonly Capability[] = [
  'orders:read', 'orders:manage', 'dispatch:manage', 'specimens:collect',
  'specimens:transport', 'labs:manage', 'results:release',
  'finance:read', 'finance:manage', 'staff:manage', 'audit:read'
];
const STAFF_ROLES: readonly StaffRole[] = [
  'administrator', 'dispatcher', 'support', 'phlebotomist',
  'courier', 'lab_coordinator', 'finance', 'result_release'
];
function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && STAFF_ROLES.some(role => role === value);
}

@Injectable()
export class AccessService implements OnModuleDestroy {
  private readonly pool?: Pool;

  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private async exists(sql: string, args: readonly string[]): Promise<boolean> {
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    // DB failures are not treated as successful authorization.
    const result = await this.pool.query(sql, [...args]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async requireBookingAccess(identitySubject: string, patientId: string): Promise<void> {
    const authorized = await this.exists(
      `SELECT 1 FROM patient_relationships rel
         INNER JOIN users usr ON usr.id=rel.user_id
       WHERE usr.identity_subject=$1 AND rel.patient_id=$2::uuid
         AND rel.can_book AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
       LIMIT 1`, [identitySubject, patientId]
    );
    if (!authorized) throw new ForbiddenException('Resource access denied');
  }

  async requireReleasedResultAccess(identitySubject: string, resultId: string): Promise<void> {
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    // The authorization decision and its successful-access audit event share one SQL statement.
    // No result document metadata or clinical payload is returned to this diagnostic endpoint.
    const result = await this.pool.query(
      `WITH allowed AS (
         SELECT usr.id AS actor_id FROM results res
           INNER JOIN patient_relationships rel ON rel.patient_id=res.patient_id
           INNER JOIN users usr ON usr.id=rel.user_id
         WHERE usr.identity_subject=$1 AND res.id=$2::uuid
           AND res.released_at IS NOT NULL AND res.released_by IS NOT NULL
           AND rel.can_view_results AND rel.verified_at IS NOT NULL AND rel.revoked_at IS NULL
         LIMIT 1
       )
       INSERT INTO audit_events(actor_id, action, resource_type, resource_id)
       SELECT actor_id, 'result.access_authorized', 'result', $2::uuid FROM allowed
       RETURNING id`,
      [identitySubject, resultId]
    );
    if (result.rowCount !== 1) throw new ForbiddenException('Resource access denied');
  }

  async staffCapabilities(identitySubject: string): Promise<Capability[]> {
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const result = await this.pool.query(
      `SELECT st.role FROM staff st JOIN users usr ON usr.id=st.user_id
       WHERE usr.identity_subject=$1 AND st.active=TRUE LIMIT 1`,
      [identitySubject]
    );
    const role: unknown = result.rows[0]?.role;
    if (!isStaffRole(role)) throw new ForbiddenException('Staff access denied');
    return STAFF_CAPABILITIES.filter(capability =>
      hasCapability({ userId: identitySubject, staffRole: role }, capability)
    );
  }

  async requireStaffCapability(identitySubject: string, capability: Capability): Promise<void> {
    const capabilities = await this.staffCapabilities(identitySubject);
    if (!capabilities.includes(capability)) throw new ForbiddenException('Staff action denied');
  }
}
