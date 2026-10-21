import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {Phase4ResultsService} from './results.service';
import {isCanonicalUuid,parseResultIntake,parseResultRelease} from './result-policy';

@Controller()
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase4ResultsController{
  constructor(private readonly service:Phase4ResultsService){}
  @Get('ops/results/pending')
  pending(@Req() req:AuthenticatedRequest){
    return this.service.pending(req.identity!);
  }
  @Post('ops/results/intake')
  intake(@Req() req:AuthenticatedRequest,@Body() body:unknown){
    return this.service.intake(req.identity!,parseResultIntake(body));
  }
  @Post('ops/results/:resultId/release')
  release(@Req() req:AuthenticatedRequest,@Param('resultId') id:string,@Body() body:unknown){
    if(!isCanonicalUuid(id))throw new BadRequestException('Invalid result ID');
    return this.service.release(req.identity!,id,parseResultRelease(body).releaseKey);
  }
  @Get('patients/:patientId/results')
  list(@Req() req:AuthenticatedRequest,@Param('patientId') id:string){
    if(!isCanonicalUuid(id))throw new BadRequestException('Invalid patient ID');
    return this.service.list(req.identity!,id);
  }
  @Get('results/:resultId')
  detail(@Req() req:AuthenticatedRequest,@Param('resultId') id:string){
    if(!isCanonicalUuid(id))throw new BadRequestException('Invalid result ID');
    return this.service.detail(req.identity!,id);
  }
}
