import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import { AccountProvisioningService } from './account-provisioning.service';
@Controller('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'Valid OIDC access token required'})
@UseGuards(IdentityGuard)
export class AccountProvisioningController {
 constructor(private readonly accounts:AccountProvisioningService){}
 @Post('bootstrap') provision(@Req() req:AuthenticatedRequest){
  return this.accounts.provision(req.identity!);
 }
}
