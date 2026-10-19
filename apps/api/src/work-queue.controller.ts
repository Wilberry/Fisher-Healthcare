import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import { SupportService } from './support.service';
import { PaymentReviewService } from './payment-review.service';

@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'MFA-protected operational role required'})
@Controller('ops/work-queue')
@UseGuards(IdentityGuard)
export class WorkQueueController {
 constructor(private readonly support:SupportService,private readonly reviews:PaymentReviewService){}
 @Get('support') supportCases(@Req() req:AuthenticatedRequest){
  return this.support.queue(req.identity!);
 }
 @Post('support/:id/:action')
 advance(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,
  @Param('action') action:string,@Body() body:unknown){
  if(!['assigned','resolved'].includes(action)||!body||typeof body!=='object'||
   !('evidenceReference' in body)||typeof body.evidenceReference!=='string')
   throw new BadRequestException('Reviewed action required');
  return this.support.advance(req.identity!,id,action as 'assigned'|'resolved',body.evidenceReference);
 }
 @Get('payment-exceptions') payments(@Req() req:AuthenticatedRequest){
  return this.reviews.queue(req.identity!);
 }
 @Post('payment-exceptions/:id/acknowledge')
 acknowledge(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){
  if(!body||typeof body!=='object'||!('evidenceReference' in body)||
   typeof body.evidenceReference!=='string')throw new BadRequestException('Review evidence required');
  return this.reviews.acknowledge(req.identity!,id,body.evidenceReference);
 }
}
