import { writeOperationalRecord } from '@fisher/observability';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import { HttpErrorFilter } from './http-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true, rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), process.env.FISHER_API_BIND_HOST ?? '0.0.0.0');
  writeOperationalRecord({ service: 'api', level: 'info', event: 'api.started' });
}

void bootstrap().catch(() => {
  writeOperationalRecord({ service: 'api', level: 'error', event: 'api.startup_failed' });
  process.exitCode = 1;
});
