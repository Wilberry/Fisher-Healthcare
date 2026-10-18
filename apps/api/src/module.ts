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

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, Phase3CustodyController, Phase3DispatchController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, Phase3CustodyService, Phase3DispatchService]
})
export class AppModule {}
