import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { bookingDraftInput, bookingCommitInput, bookingQuoteInput, rescheduleInput } from '@fisher/contracts';
import { BookingService } from './booking.service';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';

function parse<T>(schema:{safeParse(v:unknown):{success:boolean;data?:T}},v:unknown):T{
 const result=schema.safeParse(v);
 if(!result.success || !result.data)throw new BadRequestException('Invalid booking payload');
 return result.data;
}
@Controller()
export class BookingPublicController {
 constructor(private readonly bookings:BookingService){}
 @Get('catalog/tests') catalogue(@Query('search') search?:string){return this.bookings.catalogue(search);}
 @Get('catalog/labs') labs(){return this.bookings.labs();}
 @Get('catalog/tests/:id') test(@Param('id',ParseUUIDPipe) id:string){return this.bookings.testDetails(id);}
 @Get('service-zones') zones(){return this.bookings.zones();}
 @Post('availability/search') availability(@Body() body:unknown){
  const i=parse(bookingQuoteInput.pick({zoneId:true,labId:true,serviceTier:true}).strict(),body);
  return this.bookings.availability(i.zoneId,i.labId,i.serviceTier);
 }
 @Post('quotes') quote(@Body() body:unknown){return this.bookings.quote(parse(bookingQuoteInput,body));}
 @Get('quotes/:id') getQuote(@Param('id',ParseUUIDPipe) id:string){return this.bookings.getQuote(id);}
}
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'OIDC authentication required'})
@Controller()
@UseGuards(IdentityGuard)
export class BookingPatientController {
 constructor(private readonly bookings:BookingService){}
 @Post('booking-drafts') draft(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  const i=parse(bookingDraftInput,body);return this.bookings.draft(req.identity!.subject,i.quoteId,i.patientId);
 }
 @Post('bookings') commit(@Req() req:AuthenticatedRequest,@Body() body:unknown,@Headers('idempotency-key') key?:string){
  if(!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))throw new BadRequestException('Idempotency-Key required');
  const i=parse(bookingCommitInput,body);return this.bookings.commit(req.identity!.subject,i.draftId,key);
 }
 @Get('me/notifications') notifications(@Req() req:AuthenticatedRequest){
  return this.bookings.notifications(req.identity!.subject);
 }
 @Get('me/bookings') history(@Req() req:AuthenticatedRequest){return this.bookings.history(req.identity!.subject);}
 @Get('bookings/:id') get(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.bookings.booking(req.identity!.subject,id);
 }
 @Get('bookings/:id/timeline') timeline(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.bookings.booking(req.identity!.subject,id);
 }
 @Get('bookings/:id/receipt')
 receipt(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.bookings.receipt(req.identity!.subject,id);
 }
 @Post('bookings/:id/reschedule')
 reschedule(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,
  @Body() body:unknown,@Headers('idempotency-key') key?:string){
  if(!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))throw new BadRequestException('Idempotency-Key required');
  const input=parse(rescheduleInput,body);
  return this.bookings.reschedule(req.identity!.subject,id,input.slotId,key);
 }
 @Post('bookings/:id/cancel') cancel(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.bookings.cancel(req.identity!.subject,id);
 }
}
