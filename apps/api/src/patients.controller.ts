import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import { PatientsService } from './patients.service';
import { AddressesService } from './addresses.service';

@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'OIDC session required'})
@Controller('patients')
@UseGuards(IdentityGuard)
export class PatientsController {
 constructor(private readonly patients:PatientsService,private readonly addresses:AddressesService){}
 @Get() list(@Req() req:AuthenticatedRequest){return this.patients.list(req.identity!.subject);}
 @Post() create(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.patients.create(req.identity!.subject,this.patients.parse(body));
 }
 @Get(':id/addresses')
 addressesForPatient(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.addresses.list(req.identity!.subject,id);
 }
 @Post(':id/addresses')
 createAddress(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){
  return this.addresses.create(req.identity!.subject,id,this.addresses.parse(body));
 }
 @Post(':id/revoke')
 revoke(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.patients.revoke(req.identity!.subject,id);
 }
 @Get(':id') get(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.patients.get(req.identity!.subject,id);
 }
}
