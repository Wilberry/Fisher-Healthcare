import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './module';

class OpenApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenApiContractError';
  }
}

const REQUIRED_ROUTES = [
  '/api/v1/health',
  '/api/v1/identity/session',
  '/api/v1/foundation/service-tiers',
  '/api/v1/access/patients/{patientId}/booking-authority',
  '/api/v1/access/results/{resultId}/authorization',
  '/api/v1/access/staff/capabilities',
  '/api/v1/access/staff/capabilities/{capability}'
] as const;

const AUTHENTICATED_ROUTES = REQUIRED_ROUTES.filter(path =>
  path.startsWith('/api/v1/identity/') || path.startsWith('/api/v1/access/')
);

function validateDocument(document: OpenAPIObject): void {
  for (const path of REQUIRED_ROUTES) {
    const route = document.paths[path];
    if (!route || !route.get) {
      throw new OpenApiContractError(`Required GET route missing from generated OpenAPI: ${path}`);
    }
  }

  for (const path of AUTHENTICATED_ROUTES) {
    const auth = document.paths[path]?.get?.security;
    if (!auth?.some(scheme => Object.hasOwn(scheme, 'bearer'))) {
      throw new OpenApiContractError(`Bearer security metadata missing from protected route: ${path}`);
    }
  }

  if (!document.components?.securitySchemes?.bearer) {
    throw new OpenApiContractError('Required bearer authentication scheme is not documented');
  }
}

async function generate(): Promise<void> {
  let app: INestApplication | undefined;
  let stage = 'bootstrap';
  try {
    // Execute this from dist/openapi.js, built with tsc and emitDecoratorMetadata.
    // Executing the original TS file via tsx omits Nest dependency metadata.
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');

    stage = 'controller discovery';
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Fisher Healthcare API')
        .setDescription('Foundation API contracts. Booking, payments, and clinical endpoints are not activated.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build()
    );

    stage = 'contract validation';
    validateDocument(document);

    stage = 'writing artifact';
    const destination = resolve(process.cwd(), '../../docs/api/openapi.json');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(document, null, 2) + '\n', { encoding: 'utf8' });

    console.info(`Generated Fisher Healthcare OpenAPI specification: ${Object.keys(document.paths).length} paths`);
  } catch (error) {
    if (error instanceof OpenApiContractError) {
      console.error(error.message);
    } else {
      const kind = error instanceof Error ? error.name : 'UnknownError';
      console.error(`OpenAPI ${stage} failed (${kind}).`);
      // Detailed stack traces may include environment settings. Require an
      // explicit synthetic-only development scope to emit them.
      if (process.env.FISHER_OPENAPI_DEBUG === '1' &&
          process.env.FISHER_PHASE1_LOCAL_ACK === 'synthetic-only') {
        console.error(error);
      }
    }
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
}

void generate().catch(() => {
  console.error('OpenAPI generator cleanup failed');
  process.exitCode = 1;
});
