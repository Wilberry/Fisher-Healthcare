import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard';
import { IdentityGuard } from './identity.guard';
@Controller('identity')
@UseGuards(IdentityGuard)
export class IdentityController {
  @Get('session')
  session(@Req() request: AuthenticatedRequest) {
    return { authenticated: true, subject: request.identity!.subject };
  }
}
