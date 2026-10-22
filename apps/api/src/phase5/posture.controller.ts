import {ApiBearerAuth} from '@nestjs/swagger';
import {Controller,Get,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {Phase5PostureService} from './posture.service';

@Controller('ops/pilot-readiness')
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase5PostureController{
 constructor(private readonly posture:Phase5PostureService){}
 @Get('snapshot')
 snapshot(@Req() request:AuthenticatedRequest){
  return this.posture.snapshot(request.identity!);
 }
}
