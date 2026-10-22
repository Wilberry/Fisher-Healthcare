import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {Phase4RefundService} from './refund.service';
import {parseRefundRequest,parseRefundReview} from './refund-policy';
import {isCanonicalUuid} from './result-policy';

@ApiBearerAuth()
@Controller('finance/refunds')
@UseGuards(IdentityGuard)
export class Phase4RefundController{
  constructor(private readonly refunds:Phase4RefundService){}
  @Get()
  list(@Req() req:AuthenticatedRequest){return this.refunds.list(req.identity!);}
  @Post()
  create(@Req() req:AuthenticatedRequest,@Body() body:unknown){
    return this.refunds.request(req.identity!,parseRefundRequest(body));
  }
  @Post(':id/review')
  review(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
    if(!isCanonicalUuid(id))throw new BadRequestException('Invalid refund request ID');
    const decision=parseRefundReview(body);
    return this.refunds.review(req.identity!,id,decision.decision,decision.note);
  }
}
