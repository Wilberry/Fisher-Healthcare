import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AccessService, STAFF_CAPABILITIES } from './access.service';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import type { Capability } from '@fisher/auth';

@Controller('access')
@UseGuards(IdentityGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('patients/:patientId/booking-authority')
  async booking(@Req() req: AuthenticatedRequest, @Param('patientId', ParseUUIDPipe) patientId: string) {
    await this.access.requireBookingAccess(req.identity!.subject, patientId);
    return { authorized: true };
  }

  @Get('results/:resultId/authorization')
  async result(@Req() req: AuthenticatedRequest, @Param('resultId', ParseUUIDPipe) resultId: string) {
    await this.access.requireReleasedResultAccess(req.identity!.subject, resultId);
    return { authorized: true };
  }

  @Get('staff/capabilities')
  async capabilities(@Req() req: AuthenticatedRequest) {
    return { capabilities: await this.access.staffCapabilities(req.identity!.subject) };
  }

  @Get('staff/capabilities/:capability')
  async capability(@Req() req: AuthenticatedRequest, @Param('capability') requested: string) {
    if (!STAFF_CAPABILITIES.some(capability => capability === requested)) {
      throw new BadRequestException('Unknown capability');
    }
    await this.access.requireStaffCapability(req.identity!.subject, requested as Capability);
    return { authorized: true };
  }
}
