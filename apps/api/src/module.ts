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

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, Phase3CustodyController, Phase3DispatchController, Phase3FieldAssignmentsController, Phase3OfflineSyncController, Phase3IncidentsController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, Phase3CustodyService, Phase3DispatchService, Phase3FieldAssignmentsService, Phase3IncidentsService]
})
export class AppModule {}
