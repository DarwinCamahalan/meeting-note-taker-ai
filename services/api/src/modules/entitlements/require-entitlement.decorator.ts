/**
 * `@RequireEntitlement(key)` — attaches the required {@link EntitlementKey} to a
 * route handler as metadata read by {@link RequireEntitlementGuard}. The literal
 * metadata key is shared with @cue/types so the decorator, guard, and any tests
 * never drift.
 *
 *   @RequireEntitlement('rag.upload')
 *   @Post('documents')
 *   upload() { ... }
 */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { REQUIRE_ENTITLEMENT_METADATA_KEY, type EntitlementKey } from '@cue/types';

export function RequireEntitlement(key: EntitlementKey): CustomDecorator<string> {
  return SetMetadata(REQUIRE_ENTITLEMENT_METADATA_KEY, key);
}
