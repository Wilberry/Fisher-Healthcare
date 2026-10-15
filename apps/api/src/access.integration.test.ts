import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Pool } from 'pg';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './module';

const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite.sequential('authenticated resource access (disposable PostgreSQL only)', () => {
  let pool: Pool;
  let app: INestApplication;
  let jwksServer: Server;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let tokenOwner: string;
  let tokenAdmin: string;
  let tokenExpired: string;
  const ownerSub = `synthetic-owner-${randomUUID()}`;
  const adminSub = `synthetic-admin-${randomUUID()}`;
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const patientId = randomUUID();
  const labId = randomUUID();
  const orderId = randomUUID();
  const resultId = randomUUID();
  const relationshipId = randomUUID();
  const staffId = randomUUID();
  const originalEnv = {
    OIDC_ISSUER: process.env.OIDC_ISSUER,
    OIDC_AUDIENCE: process.env.OIDC_AUDIENCE,
    OIDC_JWKS_URI: process.env.OIDC_JWKS_URI,
    NODE_ENV: process.env.NODE_ENV
  };

  async function sign(subject: string, seconds = 300): Promise<string> {
    return new SignJWT({ purpose: 'synthetic-foundation-test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'fisher-test-key' })
      .setIssuer('https://identity.fisher.test')
      .setAudience('fisher-api')
      .setSubject(subject)
      .setIssuedAt(seconds < 0 ? Math.floor(Date.now() / 1000) - 600 : Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
      .sign(privateKey);
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('fisher_test')) {
      throw new Error('Refusing patient authorization integration tests outside disposable fisher_test DB');
    }
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    jwk.kid = 'fisher-test-key';
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    jwksServer = createServer((_req, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve, reject) => {
      jwksServer.once('error', reject);
      jwksServer.listen(0, 'localhost', () => resolve());
    });
    const port = (jwksServer.address() as AddressInfo).port;
    process.env.NODE_ENV = 'test';
    process.env.OIDC_ISSUER = 'https://identity.fisher.test';
    process.env.OIDC_AUDIENCE = 'fisher-api';
    process.env.OIDC_JWKS_URI = `http://localhost:${port}/jwks`;

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      'INSERT INTO users(id,identity_subject) VALUES($1,$2),($3,$4)',
      [ownerId, ownerSub, adminId, adminSub]
    );
    await pool.query('INSERT INTO patients(id,display_name) VALUES($1,$2)', [patientId, 'Synthetic Patient']);
    await pool.query('INSERT INTO laboratories(id,name) VALUES($1,$2)', [labId, 'Synthetic Lab']);
    await pool.query(
      `INSERT INTO patient_relationships
        (id,user_id,patient_id,relationship,can_book,can_view_results,verified_at)
       VALUES($1,$2,$3,'self',true,true,now())`,
      [relationshipId, ownerId, patientId]
    );
    await pool.query(
      `INSERT INTO staff(id,user_id,role,active) VALUES($1,$2,'administrator',true)`,
      [staffId, adminId]
    );
    await pool.query(
      `INSERT INTO orders(id,patient_id,booked_by,lab_id,tier,total_kobo)
       VALUES($1,$2,$3,$4,'regular',0)`,
      [orderId, patientId, ownerId, labId]
    );
    await pool.query(
      `INSERT INTO results(id,order_id,patient_id,object_key,released_at,released_by)
       VALUES($1,$2,$3,$4,now(),$5)`,
      [resultId, orderId, patientId, 'synthetic/no-real-clinical-document', adminId]
    );

    tokenOwner = await sign(ownerSub);
    tokenAdmin = await sign(adminSub);
    tokenExpired = await sign(ownerSub, -10);
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (jwksServer) await new Promise<void>(resolve => jwksServer.close(() => resolve()));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // Synthetic records are intentionally retained in the disposable database:
    // successful clinical authorization checks create immutable audit events.
  });

  it('denies unauthenticated and expired credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/identity/session').expect(401);
    await request(app.getHttpServer()).get('/api/v1/identity/session')
      .set('Authorization', `Bearer ${tokenExpired}`).expect(401);
  });

  it('verifies a signed identity and enforces current booking authority', async () => {
    await request(app.getHttpServer()).get('/api/v1/identity/session')
      .set('Authorization', `Bearer ${tokenOwner}`).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/access/patients/${patientId}/booking-authority`)
      .set('Authorization', `Bearer ${tokenOwner}`).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/access/patients/${patientId}/booking-authority`)
      .set('Authorization', `Bearer ${tokenAdmin}`).expect(403);
  });

  it('authorizes released results only for the right patient and audits the access', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/access/results/${resultId}/authorization`)
      .set('Authorization', `Bearer ${tokenAdmin}`).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/access/results/${resultId}/authorization`)
      .set('Authorization', `Bearer ${tokenOwner}`).expect(200);
    const audit = await pool.query(
      `SELECT id FROM audit_events WHERE actor_id=$1 AND resource_id=$2 AND action='result.access_authorized'`,
      [ownerId, resultId]
    );
    expect(audit.rows.length).toBe(1);
  });

  it('denies administrators clinical release capability', async () => {
    await request(app.getHttpServer()).get('/api/v1/access/staff/capabilities/staff:manage')
      .set('Authorization', `Bearer ${tokenAdmin}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/access/staff/capabilities/results:release')
      .set('Authorization', `Bearer ${tokenAdmin}`).expect(403);
  });

  it('revokes booking and result access immediately for an existing session', async () => {
    await pool.query(
      `UPDATE patient_relationships SET can_book=false, can_view_results=false, revoked_at=now()
       WHERE id=$1`, [relationshipId]
    );
    await request(app.getHttpServer())
      .get(`/api/v1/access/patients/${patientId}/booking-authority`)
      .set('Authorization', `Bearer ${tokenOwner}`).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/access/results/${resultId}/authorization`)
      .set('Authorization', `Bearer ${tokenOwner}`).expect(403);
  });
});
