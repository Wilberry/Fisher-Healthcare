import { Module, Controller, Get } from '@nestjs/common';
@Controller('health') class HealthController { @Get() status() { return { status: 'ok', service: 'fisher-api' }; } }
@Module({controllers:[HealthController]}) export class AppModule {}
