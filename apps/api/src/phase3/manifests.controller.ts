import { BadRequestException, Body, Controller, Post, Param, Req, UseGuards, Injectable, OnModuleDestroy, ServiceUnavailableException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { requireStaffMfa, type AuthenticatedIdentity } from '../identity';
import { AccessService } from '../access.service';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class Phase3ManifestService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(private readonly access: AccessService) {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  async onModuleDestroy() { await this.pool?.end(); }
  async prepare(identity: AuthenticatedIdentity, labId: string, specimenIds: string[]) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'dispatch:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const valid = await client.query(
        `SELECT sp.id FROM specimens sp JOIN orders ord ON ord.id=sp.order_id
         WHERE sp.id=ANY($1::uuid[]) AND ord.lab_id=$2
         AND sp.status='in_transit' FOR UPDATE OF sp`, [specimenIds, labId]);
      if (valid.rowCount !== specimenIds.length) throw new ConflictException('Manifest specimens not eligible');
      const manifest = await client.query<{ id: string }>(
        `INSERT INTO phase3_lab_manifests(lab_id,created_by)
         SELECT $1,usr.id FROM users usr WHERE usr.identity_subject=$2 RETURNING id`,
        [labId, identity.subject]);
      if (manifest.rowCount !== 1) throw new ForbiddenException();
      const id = manifest.rows[0]!.id;
      await client.query(
        `INSERT INTO phase3_manifest_specimens(manifest_id,specimen_id)
         SELECT $1,unnest($2::uuid[])`, [id, specimenIds]);
      await client.query('COMMIT');
      return { data: { id, status: 'prepared', specimenCount: specimenIds.length } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async receive(identity: AuthenticatedIdentity, manifestId: string, receiptKey: string, acceptedIds: string[], rejectedIds: string[]) {
    requireStaffMfa(identity);
    await this.access.requireStaffCapability(identity.subject, 'labs:manage');
    if (!this.pool) throw new ServiceUnavailableException('Data service unavailable');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const manifest = await client.query<{ status: string }>(
        'SELECT status FROM phase3_lab_manifests WHERE id=$1 FOR UPDATE', [manifestId]);
      if (manifest.rows[0]?.status !== 'prepared') throw new ConflictException('Manifest unavailable');
      const expected = await client.query<{ specimen_id: string }>(
        'SELECT specimen_id FROM phase3_manifest_specimens WHERE manifest_id=$1 ORDER BY specimen_id', [manifestId]);
      const supplied = [...acceptedIds, ...rejectedIds];
      if (new Set(supplied).size !== supplied.length ||
          supplied.length !== expected.rows.length ||
          !supplied.every(id => expected.rows.some(row => row.specimen_id === id)))
        throw new ConflictException('Receipt does not reconcile');
      const receiver = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE identity_subject=$1', [identity.subject]);
      if (receiver.rowCount !== 1) throw new ForbiddenException();
      const actorId = receiver.rows[0]!.id;
      await client.query(
        `INSERT INTO phase3_manifest_receipts(manifest_id,receipt_key,received_by,accepted_specimen_ids,rejected_specimen_ids)
         VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
        [manifestId, receiptKey, actorId, JSON.stringify(acceptedIds), JSON.stringify(rejectedIds)]);
      await client.query(
        `UPDATE phase3_lab_manifests SET status='received',received_at=now(),received_by=$2 WHERE id=$1`,
        [manifestId, actorId]);
      await client.query('COMMIT');
      return { data: { id: manifestId, status: 'received' } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
@Controller('ops/lab-manifests')
@UseGuards(IdentityGuard)
export class Phase3ManifestController {
  constructor(private readonly service: Phase3ManifestService) {}
  @Post()
  prepare(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!req.identity || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid manifest');
    const b = body as Record<string, unknown>;
    if (typeof b.labId !== 'string' || !uuid.test(b.labId) ||
        !Array.isArray(b.specimenIds) || b.specimenIds.length < 1 || b.specimenIds.length > 100 ||
        !b.specimenIds.every(id => typeof id === 'string' && uuid.test(id)) ||
        new Set(b.specimenIds).size !== b.specimenIds.length) throw new BadRequestException('Invalid manifest');
    return this.service.prepare(req.identity, b.labId, b.specimenIds);
  }
  @Post(':id/receipt')
  receive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!req.identity || !uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid receipt');
    const b = body as Record<string, unknown>;
    if (typeof b.receiptKey !== 'string' || !uuid.test(b.receiptKey) ||
        !Array.isArray(b.acceptedIds) || !Array.isArray(b.rejectedIds) ||
        b.acceptedIds.length + b.rejectedIds.length > 100 ||
        ![...b.acceptedIds,...b.rejectedIds].every(x => typeof x === 'string' && uuid.test(x)))
      throw new BadRequestException('Invalid receipt');
    return this.service.receive(req.identity, id, b.receiptKey, b.acceptedIds, b.rejectedIds);
  }
}
