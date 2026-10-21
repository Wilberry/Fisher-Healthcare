import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {Phase4LabSettlementsService} from './lab-settlement.service';
import {parsePayable,parseSettlement} from './lab-settlement-policy';
import {parseRefundReview} from './refund-policy';
import {isCanonicalUuid} from './result-policy';

@ApiBearerAuth()
@Controller('finance')
@UseGuards(IdentityGuard)
export class Phase4LabSettlementController{
 constructor(private readonly service:Phase4LabSettlementsService){}
 @Get('lab-payables')
 payables(@Req() req:AuthenticatedRequest){return this.service.payables(req.identity!);}
 @Post('lab-payables')
 add(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.service.addPayable(req.identity!,parsePayable(body));
 }
 @Get('lab-settlements')
 batches(@Req() req:AuthenticatedRequest){return this.service.batches(req.identity!);}
 @Post('lab-settlements')
 propose(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.service.propose(req.identity!,parseSettlement(body));
 }
 @Post('lab-settlements/:id/review')
 review(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
  if(!isCanonicalUuid(id))throw new BadRequestException('Invalid settlement identifier');
  const {decision,note}=parseRefundReview(body);
  return this.service.review(req.identity!,id,decision,note);
 }
}
