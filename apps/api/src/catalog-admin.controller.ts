import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
import { CatalogAdminService } from './catalog-admin.service';
import { approvalInput, catalogType, labInput, offeringInput, slotInput, testInput, zoneInput } from './catalog-admin.dto';
function validate<T>(schema:{safeParse(input:unknown):{success:boolean;data?:T}},v:unknown):T{
 const r=schema.safeParse(v);
 if(!r.success || !r.data)throw new BadRequestException('Invalid catalogue request');
 return r.data;
}
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'Verified staff token and MFA required'})
@Controller('ops/catalog')
@UseGuards(IdentityGuard)
export class CatalogAdminController {
 constructor(private readonly catalog:CatalogAdminService){}
 @Get('reviews') reviews(@Req() req:AuthenticatedRequest){
  return this.catalog.reviews(req.identity!);
 }
 @Post('tests') test(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.catalog.test(req.identity!,validate(testInput,body));
 }
 @Post('laboratories') lab(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.catalog.laboratory(req.identity!,validate(labInput,body));
 }
 @Post('zones') zone(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.catalog.zone(req.identity!,validate(zoneInput,body));
 }
 @Post('offerings') offering(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.catalog.offering(req.identity!,validate(offeringInput,body));
 }
 @Post('slots') slot(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  return this.catalog.slot(req.identity!,validate(slotInput,body));
 }
 @Post('reviews/:type/:id/approve')
 approve(@Req() req:AuthenticatedRequest,@Param('type') type:string,
   @Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){
  const resource=catalogType.safeParse(type);
  if(!resource.success)throw new BadRequestException('Unknown catalogue resource');
  const approved=validate(approvalInput,body);
  return this.catalog.approve(req.identity!,resource.data,id,approved.evidenceReference);
 }
}
