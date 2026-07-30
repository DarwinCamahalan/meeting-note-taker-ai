/**
 * `@RequireRole('owner', 'admin')` — attaches an {@link RbacRequirement} to a
 * route handler as metadata read by {@link RequireRoleGuard}. The literal
 * metadata key is shared with @cue/types so the decorator, guard, and any tests
 * never drift.
 *
 *   @RequireRole('owner', 'admin')
 *   @Post('sso/connections')
 *   create() { ... }
 *
 * A `permission` can be attached for sub-role granularity via
 * {@link RequireRoleWith}.
 */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import {
  REQUIRE_ROLE_METADATA_KEY,
  type Permission,
  type RbacRequirement,
  type Role,
} from '@cue/types';

/** Require the caller's org role to be one of `roles`. */
export function RequireRole(...roles: Role[]): CustomDecorator<string> {
  const requirement: RbacRequirement = { roles };
  return SetMetadata(REQUIRE_ROLE_METADATA_KEY, requirement);
}

/** Require one of `roles` and additionally a fine-grained {@link Permission}. */
export function RequireRoleWith(
  permission: Permission,
  ...roles: Role[]
): CustomDecorator<string> {
  const requirement: RbacRequirement = { roles, permission };
  return SetMetadata(REQUIRE_ROLE_METADATA_KEY, requirement);
}
