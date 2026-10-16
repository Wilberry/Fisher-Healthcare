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
import { AccountProvisioningService } from './account-provisioning.service';
import { AccountProvisioningController } from './account-provisioning.controller';

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, BookingPatientController, BookingPublicController, PaymentPatientController, PaymentWebhookController, PatientsController, AccountProvisioningController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, BookingService, PaymentService, PatientsService, AccountProvisioningService]
})
export class AppModule {}
