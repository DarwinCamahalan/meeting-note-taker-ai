/**
 * Guard that authenticates a request from its `Authorization: Bearer <jwt>`
 * header, verifies the access token, and attaches the resolved
 * {@link AuthContext} to the request for `@CurrentUser()`.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from '../../common/auth-context.js';
import { unauthorized } from '../../common/problem-details.js';
import { JwtService } from './jwt.service.js';
import type { AccessClaims } from './token-claims.js';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw unauthorized('Missing or malformed Authorization header.');
    }

    const token = header.slice(BEARER_PREFIX.length);
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verify<AccessClaims>(token);
    } catch {
      throw unauthorized('Invalid or expired access token.');
    }
    if (claims.typ !== 'access') {
      throw unauthorized('Wrong token type.');
    }

    req.authContext = {
      userId: claims.sub,
      orgId: claims.org,
      email: claims.email,
      region: claims.region,
      roles: claims.roles,
    };
    return true;
  }
}
