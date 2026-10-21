import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {Phase4FinanceService} from './finance.service';
import {isCanonicalUuid} from './result-policy';

@Controller('finance')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase4FinanceController{
  constructor(private readonly finance:Phase4FinanceService){}
  @Get('transactions')
  transactions(@Req() req:AuthenticatedRequest){
    return this.finance.transactions(req.identity!);
  }
  @Get('reconciliation')
  runs(@Req() req:AuthenticatedRequest){
    return this.finance.runs(req.identity!);
  }
  @Post('reconciliation/runs')
  reconcile(@Req() req:AuthenticatedRequest,@Body() body:unknown){
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||!('runKey' in body)||
       !isCanonicalUuid(body.runKey))
      throw new BadRequestException('Invalid reconciliation key');
    return this.finance.reconcile(req.identity!,body.runKey);
  }
}
