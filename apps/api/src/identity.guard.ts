import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityVerifier, type AuthenticatedIdentity } from './identity';
export interface AuthenticatedRequest extends Request { identity?: AuthenticatedIdentity }
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly verifier: IdentityVerifier) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.identity) throw new UnauthorizedException('Unexpected identity state');
    request.identity = await this.verifier.verify(request.headers.authorization);
    return true;
  }
}
