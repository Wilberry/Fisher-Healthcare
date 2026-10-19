import { Controller, Get, Module } from '@nestjs/common';
import { IdentityVerifier } from './identity';
import { IdentityGuard } from './identity.guard';
import { IdentityController } from './identity.controller';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { FoundationController } from './foundation.controller';
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

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, Phase3CustodyController, Phase3DispatchController, Phase3FieldAssignmentsController, Phase3OfflineSyncController, Phase3IncidentsController, Phase3ManifestController, Phase3HandoffController, Phase3AssignmentEventsController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, Phase3CustodyService, Phase3DispatchService, Phase3FieldAssignmentsService, Phase3IncidentsService, Phase3ManifestService, Phase3HandoffService, Phase3AssignmentEventsService]
})
export class AppModule {}
