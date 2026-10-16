import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { checkoutInput } from '@fisher/contracts';
import { PaymentService } from './payment.service';
import { BookingService } from './booking.service';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard';
@Controller('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({description:'OIDC authentication required'})
@UseGuards(IdentityGuard)
export class PaymentPatientController {
 constructor(private readonly payments:PaymentService,private readonly bookings:BookingService){}
 @Post('checkout') checkout(@Req() req:AuthenticatedRequest,@Body() body:unknown){
  const data=checkoutInput.safeParse(body);
  if(!data.success)throw new BadRequestException('Invalid checkout payload');
  return this.payments.checkout(req.identity!.subject,data.data.bookingId);
 }
 @Get(':id') payment(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string){
  return this.bookings.payment(req.identity!.subject,id);
 }
}
@Controller('webhooks/payments')
export class PaymentWebhookController {
 constructor(private readonly payments:PaymentService){}
 @Post('paystack')
 process(@Req() req:AuthenticatedRequest,@Headers('x-paystack-signature') signature:string|undefined){
  return this.payments.webhook(req.rawBody,signature);
 }
}
