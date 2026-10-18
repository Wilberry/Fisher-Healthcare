import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IdentityGuard, type AuthenticatedRequest } from '../identity.guard';
import { Phase3DispatchService } from './dispatch.service';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Controller('ops/assignments')
@UseGuards(IdentityGuard)
export class Phase3DispatchController {
  constructor(private readonly service: Phase3DispatchService) {}
  @Post()
  assign(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (!req.identity || typeof body !== 'object' || body === null || Array.isArray(body))
      throw new BadRequestException('Invalid assignment');
    const b = body as Record<string, unknown>;
    if (typeof b.orderId !== 'string' || !uuid.test(b.orderId) ||
        typeof b.staffId !== 'string' || !uuid.test(b.staffId) ||
        typeof b.shiftId !== 'string' || !uuid.test(b.shiftId))
      throw new BadRequestException('Invalid assignment');
    return this.service.assign(req.identity, b.orderId, b.staffId, b.shiftId);
  }
}
