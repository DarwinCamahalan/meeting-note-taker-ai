/**
 * RequireEntitlementGuard — the authoritative server-side feature gate. Reads
 * the {@link EntitlementKey} set by `@RequireEntitlement(key)` and asks the
 * {@link EntitlementsService} whether the caller's org is entitled. Denials are
 * rendered as an RFC 9457 problem+json carrying `code: ENTITLEMENT_REQUIRED`
 * and the offending `entitlementKey`.
 *
 * MUST run AFTER {@link JwtAuthGuard} (which populates `req.authContext`); wire
 * it as `@UseGuards(JwtAuthGuard, RequireEntitlementGuard)`.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ENTITLEMENT_METADATA_KEY, type EntitlementKey } from '@cue/types';
import type { AuthedRequest } from '../../common/auth-context.js';
import { AppException, unauthorized } from '../../common/problem-details.js';
import { EntitlementsService } from './entitlements.service.js';

@Injectable()
export class RequireEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<EntitlementKey | undefined>(
      REQUIRE_ENTITLEMENT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No entitlement declared on this route -> nothing to gate.
    if (!key) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authContext) {
      throw unauthorized('Not authenticated.');
    }

    const allowed = await this.entitlements.can(req.authContext.orgId, key);
    if (!allowed) {
      throw new AppException(
        'ENTITLEMENT_REQUIRED',
        `This feature requires the "${key}" entitlement on your plan.`,
        { entitlementKey: key },
      );
    }
    return true;
  }
}
