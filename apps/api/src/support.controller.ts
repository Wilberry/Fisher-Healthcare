import { BadRequestException, Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { supportCaseInput } from '@fisher/contracts';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import { SupportService } from './support.service';

@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'OIDC session required'})
@Controller()
@UseGuards(IdentityGuard)
export class SupportController {
 constructor(private readonly support:SupportService){}
 @Post('support/cases')
 create(@Req() req:AuthenticatedRequest,@Body() body:unknown,@Headers('idempotency-key') key?:string){
  if(!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))throw new BadRequestException('Idempotency-Key required');
  const input=supportCaseInput.safeParse(body);
  if(!input.success)throw new BadRequestException('Invalid support request');
  return this.support.create(req.identity!.subject,input.data,key);
 }
 @Get('me/support-cases') list(@Req() req:AuthenticatedRequest){
  return this.support.list(req.identity!.subject);
 }
}
