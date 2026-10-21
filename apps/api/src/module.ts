import { Controller, Get, Module } from '@nestjs/common';
import { IdentityVerifier } from './identity';
import { IdentityGuard } from './identity.guard';
import { IdentityController } from './identity.controller';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { FoundationController } from './foundation.controller';
import { BookingService } from './booking.service';
import { PublicRateLimitService } from './public-rate-limit.service';
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
import { GuestBookingService } from './guest-booking.service';
import { PaymentReviewService } from './payment-review.service';
import { WorkQueueController } from './work-queue.controller';
import { GuestBookingPublicController, GuestBookingStaffController } from './guest-booking.controller';
import { AccountProvisioningService } from './account-provisioning.service';
import { AccountProvisioningController } from './account-provisioning.controller';
import { BookingVerificationController, AddressVerificationController } from './booking-verification.controller';
import { BookingVerificationService } from './booking-verification.service';
import { Phase3CustodyController } from './phase3/custody.controller';
import { Phase3CustodyService } from './phase3/custody.service';
import { Phase3DispatchController } from './phase3/dispatch.controller';
import { Phase3DispatchService } from './phase3/dispatch.service';
import { Phase3FieldAssignmentsController, Phase3FieldAssignmentsService } from './phase3/field-assignments.controller';
import { Phase3OfflineSyncController } from './phase3/offline-sync.controller';
import { Phase3IncidentsController, Phase3IncidentsService } from './phase3/incidents.controller';
import { Phase3ManifestController, Phase3ManifestService } from './phase3/manifests.controller';
import { Phase3HandoffController, Phase3HandoffService } from './phase3/handoffs.controller';
import { Phase3AssignmentEventsController, Phase3AssignmentEventsService } from './phase3/assignment-events.controller';
import { Phase3LabAccessController, Phase3LabAccessService } from './phase3/lab-access.controller';
import { Phase3LabelController, Phase3LabelService } from './phase3/label-check.controller';
import { Phase4ResultsController } from './phase4/results.controller';
import { Phase4ResultsService } from './phase4/results.service';
import { Phase4FinanceController } from './phase4/finance.controller';
import { Phase4FinanceService } from './phase4/finance.service';

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, BookingPatientController, BookingPublicController, PaymentPatientController, PaymentWebhookController, PatientsController, AccountProvisioningController, BookingVerificationController, AddressVerificationController, SupportController, CatalogAdminController, GuestBookingPublicController, GuestBookingStaffController, WorkQueueController, Phase3CustodyController, Phase3DispatchController, Phase3FieldAssignmentsController, Phase3OfflineSyncController, Phase3IncidentsController, Phase3ManifestController, Phase3HandoffController, Phase3AssignmentEventsController, Phase3LabAccessController, Phase3LabelController, Phase4ResultsController, Phase4FinanceController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, BookingService, PublicRateLimitService, PaymentService, PatientsService, AccountProvisioningService, BookingVerificationService, AddressesService, SupportService, CatalogAdminService, GuestBookingService, PaymentReviewService, Phase3CustodyService, Phase3DispatchService, Phase3FieldAssignmentsService, Phase3IncidentsService, Phase3ManifestService, Phase3HandoffService, Phase3AssignmentEventsService, Phase3LabAccessService, Phase3LabelService, Phase4ResultsService, Phase4FinanceService]
})
export class AppModule {}
