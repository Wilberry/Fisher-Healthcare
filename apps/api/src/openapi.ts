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

  const phase2Get = [
    '/api/v1/catalog/tests','/api/v1/catalog/labs','/api/v1/service-zones',
    '/api/v1/patients','/api/v1/me/bookings','/api/v1/me/notifications',
    '/api/v1/bookings/{id}','/api/v1/bookings/{id}/receipt','/api/v1/payments/{id}',
    '/api/v1/me/support-cases','/api/v1/patients/{id}/addresses',
    '/api/v1/ops/catalog/reviews','/api/v1/ops/guest-booking/requests',
    '/api/v1/ops/work-queue/support','/api/v1/ops/work-queue/payment-exceptions',
    '/api/v1/ops/patient-relationships/pending','/api/v1/ops/patient-addresses/pending'
  ];
  const phase2Post = [
    '/api/v1/availability/search','/api/v1/quotes','/api/v1/booking-drafts',
    '/api/v1/bookings','/api/v1/payments/checkout','/api/v1/webhooks/payments/paystack',
    '/api/v1/me/bootstrap','/api/v1/support/cases','/api/v1/patients/{id}/addresses',
    '/api/v1/ops/catalog/tests','/api/v1/ops/catalog/laboratories',
    '/api/v1/ops/catalog/zones','/api/v1/ops/catalog/offerings',
    '/api/v1/ops/catalog/slots','/api/v1/ops/catalog/reviews/{type}/{id}/approve',
    '/api/v1/ops/patient-relationships/{id}/approve-booking',
    '/api/v1/ops/patient-addresses/{id}/approve',
    '/api/v1/patients/{id}/revoke','/api/v1/payments/{id}/reconcile',
    '/api/v1/guest-booking/start','/api/v1/guest-booking/verify',
    '/api/v1/ops/guest-booking/requests/{id}/assign',
    '/api/v1/ops/work-queue/support/{id}/{action}',
    '/api/v1/ops/work-queue/payment-exceptions/{id}/acknowledge'
  ];
  for(const path of phase2Get) {
    if(!document.paths[path]?.get)throw new OpenApiContractError('Phase 2 GET route missing: '+path);
  }
  for(const path of phase2Post) {
    if(!document.paths[path]?.post)throw new OpenApiContractError('Phase 2 POST route missing: '+path);
  }
  for(const [path,method] of [
    ['/api/v1/patients','get'],['/api/v1/me/bookings','get'],
    ['/api/v1/bookings/{id}','get'],['/api/v1/payments/{id}','get'],
    ['/api/v1/bookings','post'],['/api/v1/booking-drafts','post'],
    ['/api/v1/payments/checkout','post'],
    ['/api/v1/me/bootstrap','post'],['/api/v1/support/cases','post'],
    ['/api/v1/me/support-cases','get'],['/api/v1/patients/{id}/addresses','post'],
    ['/api/v1/patients/{id}/addresses','get'],
    ['/api/v1/ops/catalog/reviews','get'],
    ['/api/v1/ops/catalog/tests','post'],
    ['/api/v1/ops/catalog/laboratories','post'],
    ['/api/v1/ops/catalog/zones','post'],
    ['/api/v1/ops/catalog/offerings','post'],
    ['/api/v1/ops/catalog/slots','post'],
    ['/api/v1/ops/catalog/reviews/{type}/{id}/approve','post'],
    ['/api/v1/ops/patient-relationships/{id}/approve-booking','post'],
    ['/api/v1/ops/patient-addresses/{id}/approve','post'],
    ['/api/v1/patients/{id}/revoke','post'],
    ['/api/v1/payments/{id}/reconcile','post'],
    ['/api/v1/ops/guest-booking/requests/{id}/assign','post'],
    ['/api/v1/ops/guest-booking/requests','get'],
    ['/api/v1/ops/patient-relationships/pending','get'],
    ['/api/v1/ops/patient-addresses/pending','get'],
    ['/api/v1/ops/work-queue/support','get'],
    ['/api/v1/ops/work-queue/payment-exceptions','get'],
    ['/api/v1/ops/work-queue/support/{id}/{action}','post'],
    ['/api/v1/ops/work-queue/payment-exceptions/{id}/acknowledge','post']
  ] as const) {
    const auth=document.paths[path]?.[method]?.security;
    if(!auth?.some(s=>Object.hasOwn(s,'bearer')))
      throw new OpenApiContractError('Missing Phase 2 bearer metadata: '+path);
  }
  // Phase 3 clinical field routes must remain documented and authenticated
  // even when their service methods are disabled by default in production.
  const phase3Operations = [
    ['/api/v1/ops/assignments/queue','get'],
    ['/api/v1/ops/assignments','get'],
    ['/api/v1/ops/assignments','post'],
    ['/api/v1/field/assignments','get'],
    ['/api/v1/field/assignments/{id}','get'],
    ['/api/v1/field/assignments/{id}/events','post'],
    ['/api/v1/field/specimens/{id}/events','post'],
    ['/api/v1/field/specimens/{id}/incident','post'],
    ['/api/v1/field/events/sync','post'],
    ['/api/v1/field/handoff-offers','get'],
    ['/api/v1/field/assignments/{id}/handoff-offers','post'],
    ['/api/v1/field/handoff-offers/{id}/ack','post'],
    ['/api/v1/ops/exceptions','get'],
    ['/api/v1/ops/exceptions/{id}/resolve','post'],
    ['/api/v1/ops/lab-manifests','get'],
    ['/api/v1/ops/lab-manifests/{id}','get'],
    ['/api/v1/ops/lab-manifests','post'],
    ['/api/v1/ops/lab-manifests/{id}/receipt','post'],
    ['/api/v1/ops/labs/access-requests','post'],
    ['/api/v1/ops/labs/access-requests/{id}/approve','post'],
    ['/api/v1/ops/labs/access/{labId}/staff/{staffId}/revoke','post']
  ] as const;
  for (const [path, method] of phase3Operations) {
    const operation = document.paths[path]?.[method];
    if (!operation) {
      throw new OpenApiContractError('Phase 3 operation missing: ' + method.toUpperCase() + ' ' + path);
    }
    if (!operation.security?.some(scheme => Object.hasOwn(scheme, 'bearer'))) {
      throw new OpenApiContractError('Phase 3 bearer security missing: ' + method.toUpperCase() + ' ' + path);
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
        .setDescription('Phase 1 identity, Phase 2 booking/payment, and Phase 3 dispatch/custody contracts. Phase 3 operations are disabled outside explicit synthetic test mode.')
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
          (process.env.FISHER_PHASE1_LOCAL_ACK === 'synthetic-only' || process.env.FISHER_PHASE2_LOCAL_ACK === 'synthetic-only')) {
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
