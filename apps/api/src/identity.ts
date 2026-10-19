import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface AuthenticatedIdentity {
  subject: string;
  issuer: string;
  authenticationMethods: readonly string[];
  verifiedEmail?: string;
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization) throw new UnauthorizedException('Bearer token required');
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(authorization);
  if (!match) throw new UnauthorizedException('Invalid authorization header');
  return match[1]!;
}

export function requireStaffMfa(identity: AuthenticatedIdentity): void {
  if (!identity.authenticationMethods.includes('mfa')) {
    throw new ForbiddenException('Staff multi-factor authentication required');
  }
}

@Injectable()
export class IdentityVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  private readonly issuer: string | undefined;
  private readonly audience: string | undefined;

  constructor() {
    this.issuer = process.env.OIDC_ISSUER;
    this.audience = process.env.OIDC_AUDIENCE;
    const uri = process.env.OIDC_JWKS_URI;

    if (this.issuer && this.audience && uri) {
      if (!this.issuer.startsWith('https://')) throw new Error('OIDC issuer must be HTTPS');
      const url = new URL(uri);
      const localTest = process.env.NODE_ENV === 'test' &&
        process.env.FISHER_ALLOW_HTTP_JWKS_FOR_TESTS === 'true' &&
        url.hostname === 'localhost';
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localTest)) {
        throw new Error('OIDC JWKS must use HTTPS');
      }
      this.jwks = createRemoteJWKSet(url);
    }
  }

  async verify(authorization: string | undefined): Promise<AuthenticatedIdentity> {
    if (!this.jwks || !this.issuer || !this.audience) {
      throw new UnauthorizedException('Identity service not configured');
    }
    try {
      const { payload }: { payload: JWTPayload } = await jwtVerify(bearerToken(authorization), this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: 5
      });
      if (!payload.sub || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
        throw new Error('Required JWT claims missing');
      }
      if (payload.exp <= payload.iat || payload.exp - payload.iat > 3600) {
        throw new Error('Token lifetime exceeds authorized maximum');
      }
      const methods: unknown = payload.amr;
      const authenticationMethods = Array.isArray(methods)
        ? methods.filter((method): method is string => typeof method === 'string')
        : [];
      const verifiedEmail = payload.email_verified === true && typeof payload.email === 'string' &&
        payload.email.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)
        ? payload.email : undefined;
      return { subject: payload.sub, issuer: this.issuer, authenticationMethods,
        ...(verifiedEmail ? { verifiedEmail } : {}) };
    } catch {
      throw new UnauthorizedException('Invalid or expired identity token');
    }
  }
}
export { bearerToken };
