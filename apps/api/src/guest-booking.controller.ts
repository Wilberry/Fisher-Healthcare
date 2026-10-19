import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { GuestBookingService } from './guest-booking.service';
import { PublicRateLimitService } from './public-rate-limit.service';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
@Controller('guest-booking')
export class GuestBookingPublicController {
 constructor(private readonly guests:GuestBookingService,private readonly rate:PublicRateLimitService){}
 @Post('start') async start(@Req() req:{ip?:string},@Body() body:unknown){
  await this.rate.enforce(req.ip,'guest-start');return this.guests.start(body);
 }
 @Post('verify') async verify(@Req() req:{ip?:string},@Body() body:unknown){
  await this.rate.enforce(req.ip,'guest-verify');return this.guests.verify(body);
 }
}
@Controller('ops/guest-booking')
@UseGuards(IdentityGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'MFA-gated staff required'})
export class GuestBookingStaffController {
 constructor(private readonly guests:GuestBookingService){}
 @Get('requests') list(@Req() req:AuthenticatedRequest){return this.guests.pending(req.identity!);}
 @Post('requests/:id/assign')
 assign(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){
  if(!body||typeof body!=='object'||!('evidenceReference' in body)||
   typeof body.evidenceReference!=='string')throw new BadRequestException('Evidence reference required');
  return this.guests.assign(req.identity!,id,body.evidenceReference);
 }
}
