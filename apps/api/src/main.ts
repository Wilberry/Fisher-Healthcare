import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import { HttpErrorFilter } from './http-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

void bootstrap().catch(() => {
  console.error('Fisher API startup failed');
  process.exitCode = 1;
});
