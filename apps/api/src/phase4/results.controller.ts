import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Header,Param,Post,Req,StreamableFile,UseGuards} from '@nestjs/common';
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
  @Post('patients/:patientId/result-email-preference')
  emailPreference(@Req() req:AuthenticatedRequest,
    @Param('patientId') id:string,@Body() body:unknown){
    if(!isCanonicalUuid(id)||!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).length!==1||!('enabled' in body)||
      typeof body.enabled!=='boolean')
      throw new BadRequestException('Invalid email preference');
    return this.service.emailPreference(req.identity!,id,body.enabled);
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
  @Get('results/:resultId/document')
  @Header('Cache-Control','private, no-store')
  @Header('X-Content-Type-Options','nosniff')
  @Header('Content-Security-Policy','sandbox')
  async document(@Req() req:AuthenticatedRequest,@Param('resultId') id:string){
    if(!isCanonicalUuid(id))throw new BadRequestException('Invalid result ID');
    const bytes=await this.service.document(req.identity!,id);
    return new StreamableFile(bytes,{
      type:'application/pdf',
      disposition:'attachment; filename="fisher-laboratory-result.pdf"'
    });
  }

}
