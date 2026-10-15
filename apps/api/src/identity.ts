import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface AuthenticatedIdentity {
  subject: string;
  issuer: string;
}
function bearerToken(authorization: string | undefined): string {
  if (!authorization) throw new UnauthorizedException('Bearer token required');
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(authorization);
  if (!match) throw new UnauthorizedException('Invalid authorization header');
  return match[1]!;
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
      const url = new URL(uri);
      if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && url.hostname === 'localhost')) {
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
      const { payload }: {payload: JWTPayload} = await jwtVerify(bearerToken(authorization), this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256','ES256'],
        clockTolerance: 5
      });
      if (!payload.sub) throw new Error('Missing subject');
      return { subject: payload.sub, issuer: this.issuer };
    } catch {
      throw new UnauthorizedException('Invalid or expired identity token');
    }
  }
}
export { bearerToken };
