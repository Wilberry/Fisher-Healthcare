import { BadRequestException, Body, ConflictException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { Phase3CustodyService, type FieldCustodyInput } from './custody.service';
import { CustodyConflict, type CustodyAction } from './custody';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions: readonly string[] = ['collect','package','report_damaged'];
@Controller('field/events')
@UseGuards(IdentityGuard)
export class Phase3OfflineSyncController {
  constructor(private readonly custody: Phase3CustodyService) {}
  @Post('sync')
  async sync(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!req.identity) throw new BadRequestException('Identity missing');
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Invalid batch');
    const raw = (body as Record<string, unknown>).events;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) throw new BadRequestException('Invalid batch size');
    const events: { specimenId: string; input: FieldCustodyInput }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Invalid event');
      const b = item as Record<string, unknown>;
      if (typeof b.specimenId !== 'string' || !uuid.test(b.specimenId) ||
          typeof b.eventId !== 'string' || !uuid.test(b.eventId) ||
          typeof b.action !== 'string' || !actions.includes(b.action) ||
          !Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0 ||
          b.recipientId !== undefined || b.recipientAcknowledged !== undefined)
        throw new BadRequestException('Invalid event');
      events.push({ specimenId: b.specimenId.toLowerCase(), input: {
        eventId: b.eventId.toLowerCase(), action: b.action as CustodyAction,
        expectedVersion: b.expectedVersion as number
      } });
    }
    const outcomes: { eventId: string; accepted: boolean; data?: unknown; code?: string }[] = [];
    for (const event of events) {
      try {
        const result = await this.custody.apply(req.identity, event.specimenId, event.input);
        outcomes.push({ eventId: event.input.eventId, accepted: true, data: result.data });
      } catch (error) {
        if (error instanceof CustodyConflict) {
          outcomes.push({ eventId: event.input.eventId, accepted: false, code: error.code });
        } else if (error instanceof ConflictException) {
          outcomes.push({ eventId: event.input.eventId, accepted: false, code: 'CONFLICT_REQUIRES_REVIEW' });
        } else {
          // Authentication, authorization and infrastructure errors are batch-fatal:
          // never continue processing another specimen after scope verification fails.
          throw error;
        }
      }
    }
    return { data: { outcomes } };
  }
}
