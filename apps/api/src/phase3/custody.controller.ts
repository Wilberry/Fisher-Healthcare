import { ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Param, Post, Req, UseGuards, BadRequestException, ConflictException } from '@nestjs/common';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { Phase3CustodyService, type FieldCustodyInput } from './custody.service';
import { CustodyConflict, type CustodyAction } from './custody';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions: readonly string[] = ['collect','package','report_damaged'];
@Controller('field/specimens')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase3CustodyController {
  constructor(private readonly service: Phase3CustodyService) {}
  @Post(':id/events')
  async apply(@Req() req: AuthenticatedRequest, @Param('id') specimenId: string, @Body() body: unknown) {
    if (!req.identity) throw new BadRequestException('Identity missing');
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Invalid event');
    const b = body as Record<string, unknown>;
    if (!uuid.test(specimenId) || typeof b.eventId !== 'string' || !uuid.test(b.eventId) ||
        typeof b.action !== 'string' || !actions.includes(b.action) ||
        !Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0 ||
        b.recipientId !== undefined || b.recipientAcknowledged !== undefined) {
      throw new BadRequestException('Invalid event');
    }
    const input: FieldCustodyInput = {
      eventId: b.eventId.toLowerCase(), action: b.action as CustodyAction,
      expectedVersion: b.expectedVersion as number
    };
    try {
      return await this.service.apply(req.identity, specimenId.toLowerCase(), input);
    } catch (error) {
      if (error instanceof CustodyConflict) throw new ConflictException(error.code);
      throw error;
    }
  }
}
