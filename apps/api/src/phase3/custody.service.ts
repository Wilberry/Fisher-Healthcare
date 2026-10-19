import { ForbiddenException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { type CustodyAction, type CustodyRole } from './custody';
import { recordCustodyEvent } from './custody.repository';
import { AccessService } from '../access.service';

const roles: Record<string, CustodyRole> = {
  phlebotomist: 'collector', courier: 'courier',
  lab_coordinator: 'lab_staff', dispatcher: 'operations', administrator: 'operations'
};
export interface FieldCustodyInput {
  eventId: string;
  action: CustodyAction;
  expectedVersion: number;
  recipientId?: string;
  recipientAcknowledged?: boolean;
}
@Injectable()
export class Phase3CustodyService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  async onModuleDestroy(): Promise<void> { await this.pool?.end(); }
  async apply(identity: AuthenticatedIdentity, specimenId: string, input: FieldCustodyInput) {
    requireStaffMfa(identity);
    // The field endpoint is intentionally collection-scoped. A client-supplied
    // boolean is not proof of courier or laboratory handoff acknowledgment.
    if (!['collect', 'package', 'report_damaged'].includes(input.action)) {
      throw new ForbiddenException('Use a verified handoff workflow');
    }
    await this.access.requireStaffCapability(identity.subject, 'specimens:collect');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const actor = await client.query<{ user_id: string; role: string }>(
        'SELECT st.user_id, st.role FROM staff st JOIN users usr ON usr.id=st.user_id WHERE usr.identity_subject=$1 AND st.active=TRUE LIMIT 1',
        [identity.subject]
      );
      const staff = actor.rows[0];
      const role = staff && roles[staff.role];
      if (!staff || !role || role !== 'collector') throw new ForbiddenException('Field collector access denied');
      const allowed = await client.query(
        `SELECT 1 FROM specimens sp JOIN orders ord ON ord.id=sp.order_id
         WHERE sp.id=$1 AND EXISTS (
           SELECT 1 FROM phase3_assignments a JOIN staff st ON st.id=a.staff_id
           WHERE a.order_id=ord.id AND st.user_id=$2
             AND a.status IN ('assigned','arrived','collecting')
         ) LIMIT 1`,
        [specimenId, staff.user_id]
      );
      if (allowed.rowCount !== 1) throw new ForbiddenException('Specimen access denied');
      const receipt = await recordCustodyEvent(client, {
        specimenId, eventId: input.eventId, actorId: staff.user_id, role,
        action: input.action, expectedVersion: input.expectedVersion,
        recipientId: input.recipientId, recipientAcknowledged: input.recipientAcknowledged
      });
      await client.query('COMMIT');
      return { data: receipt };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
