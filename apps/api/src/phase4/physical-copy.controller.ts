import {ApiBearerAuth} from '@nestjs/swagger';
import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard,type AuthenticatedRequest} from '../identity.guard';
import {isCanonicalUuid} from './result-policy';
import {parsePhysicalCopyRequest,parsePhysicalCopyQuote} from './physical-copy-policy';
import {Phase4PhysicalCopyService} from './physical-copy.service';

@Controller()
@ApiBearerAuth()
@UseGuards(IdentityGuard)
export class Phase4PhysicalCopyController{
 constructor(private readonly physical:Phase4PhysicalCopyService){}
 @Get('patients/:patientId/physical-copies')
 patientRequests(@Req() req:AuthenticatedRequest,@Param('patientId') id:string){
   if(!isCanonicalUuid(id))throw new BadRequestException('Invalid patient ID');
   return this.physical.patientRequests(req.identity!,id);
 }
 @Post('patients/:patientId/physical-copies')
 request(@Req() req:AuthenticatedRequest,@Param('patientId') id:string,
   @Body() body:unknown){
   if(!isCanonicalUuid(id))throw new BadRequestException('Invalid patient ID');
   return this.physical.request(req.identity!,id,parsePhysicalCopyRequest(body));
 }
 @Post('patients/:patientId/physical-copies/:id/cancel')
 cancel(@Req() req:AuthenticatedRequest,@Param('patientId') patientId:string,
   @Param('id') id:string){
   if(!isCanonicalUuid(id)||!isCanonicalUuid(patientId))
     throw new BadRequestException('Invalid physical-copy ID');
   return this.physical.cancel(req.identity!,patientId,id);
 }
 @Get('finance/physical-copies')
 queue(@Req() req:AuthenticatedRequest){return this.physical.queue(req.identity!);}
 @Post('finance/physical-copies/:id/quote')
 quote(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){
   if(!isCanonicalUuid(id))throw new BadRequestException('Invalid physical-copy ID');
   return this.physical.quote(req.identity!,id,parsePhysicalCopyQuote(body).amountKobo);
 }
}
