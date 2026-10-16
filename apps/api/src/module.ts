import { Controller, Get, Module } from '@nestjs/common';
import { IdentityVerifier } from './identity';
import { IdentityGuard } from './identity.guard';
import { IdentityController } from './identity.controller';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { FoundationController } from './foundation.controller';
import { BookingService } from './booking.service';
import { BookingPatientController, BookingPublicController } from './booking.controller';
import { PaymentService } from './payment.service';
import { PaymentPatientController, PaymentWebhookController } from './payment.controller';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { AddressesService } from './addresses.service';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogAdminController } from './catalog-admin.controller';
import { AccountProvisioningService } from './account-provisioning.service';
import { AccountProvisioningController } from './account-provisioning.controller';
import { BookingVerificationController, AddressVerificationController } from './booking-verification.controller';
import { BookingVerificationService } from './booking-verification.service';

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, BookingPatientController, BookingPublicController, PaymentPatientController, PaymentWebhookController, PatientsController, AccountProvisioningController, BookingVerificationController, AddressVerificationController, SupportController, CatalogAdminController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, BookingService, PaymentService, PatientsService, AccountProvisioningService, BookingVerificationService, AddressesService, SupportService, CatalogAdminService]
})
export class AppModule {}
