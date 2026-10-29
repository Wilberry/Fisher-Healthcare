import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {isAlertCode} from './alerts.policy';
import {Phase5AlertsService} from './alerts.service';
@Controller('ops/pilot-readiness')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase5AlertsController{
 constructor(private readonly service:Phase5AlertsService){}
 @Get('alerts')
 list(@Req() request:AuthenticatedRequest){
  return this.service.list(request.identity!);
 }
 @Post('evaluate')
 evaluate(@Req() request:AuthenticatedRequest){
  return this.service.evaluate(request.identity!);
 }
 @Post('alerts/:code/acknowledge')
 acknowledge(@Req() request:AuthenticatedRequest,@Param('code') code:string){
  if(!isAlertCode(code))throw new BadRequestException('Invalid alert signal');
  return this.service.acknowledge(request.identity!,code);
 }
}
