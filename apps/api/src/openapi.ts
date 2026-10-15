import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './module';

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Fisher Healthcare API')
        .setDescription('Foundation API contracts. Booking, payments, and clinical endpoints are not activated.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build()
    );
    const paths = Object.keys(document.paths);
    for (const expected of ['/api/v1/health', '/api/v1/identity/session', '/api/v1/access/results/{resultId}/authorization']) {
      if (!paths.includes(expected)) throw new Error(`Missing OpenAPI path: ${expected}`);
    }
    const destination = resolve(process.cwd(), '../../docs/api/openapi.json');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(document, null, 2) + '\n', { encoding: 'utf8' });
    console.info(`Generated Fisher Healthcare OpenAPI specification: ${paths.length} paths`);
  } finally {
    await app.close();
  }
}
void generate().catch(() => { console.error('OpenAPI generation failed'); process.exitCode = 1; });
