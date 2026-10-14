import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
async function bootstrap() { const app = await NestFactory.create(AppModule); app.setGlobalPrefix('api/v1'); app.enableShutdownHooks(); await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0'); }
void bootstrap();
