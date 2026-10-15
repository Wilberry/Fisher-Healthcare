import { Module, Controller, Get } from '@nestjs/common';
import { IdentityVerifier } from './identity';
import { IdentityGuard } from './identity.guard';
import { IdentityController } from './identity.controller';
@Controller('health') class HealthController { @Get() status() { return { status: 'ok', service: 'fisher-api' }; } }
@Module({controllers:[HealthController, IdentityController], providers:[IdentityVerifier, IdentityGuard]}) export class AppModule {}
