import { Controller, Get, Module } from '@nestjs/common';
import { IdentityVerifier } from './identity';
import { IdentityGuard } from './identity.guard';
import { IdentityController } from './identity.controller';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { FoundationController } from './foundation.controller';
import { BookingService } from './booking.service';
import { BookingPatientController, BookingPublicController } from './booking.controller';

@Controller('health')
class HealthController {
  @Get()
  status() {
    return { status: 'ok', service: 'fisher-api' };
  }
}

@Module({
  controllers: [HealthController, IdentityController, AccessController, FoundationController, BookingPatientController, BookingPublicController],
  providers: [IdentityVerifier, IdentityGuard, AccessService, BookingService]
})
export class AppModule {}
