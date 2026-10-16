import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { BookingVerificationService } from './booking-verification.service';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
const evidence=z.object({evidenceReference:z.string().regex(/^[A-Za-z0-9._:-]{10,128}$/)}).strict();
@Controller('ops/patient-relationships')
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'Staff identity and MFA required'})
@UseGuards(IdentityGuard)
export class BookingVerificationController {
 constructor(private readonly workflow:BookingVerificationService){}
 @Post(':id/approve-booking')
 approve(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){
  const parsed=evidence.safeParse(body);
  if(!parsed.success)throw new BadRequestException('Valid reviewed evidence reference required');
  return this.workflow.approve(req.identity!,id,parsed.data.evidenceReference);
 }
}
