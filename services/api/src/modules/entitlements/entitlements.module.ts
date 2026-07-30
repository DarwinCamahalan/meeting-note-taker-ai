/**
 * EntitlementsModule — owns the entitlements table as the runtime source of
 * truth for feature gates. Exports {@link EntitlementsService} (read/reconcile)
 * and {@link RequireEntitlementGuard} so BillingWebhooks can reconcile and any
 * guarded module can gate routes with `@RequireEntitlement(key)`.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsController } from './entitlements.controller.js';
import { EntitlementsService } from './entitlements.service.js';
import { RequireEntitlementGuard } from './require-entitlement.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [EntitlementsController],
  providers: [EntitlementsService, RequireEntitlementGuard],
  exports: [EntitlementsService, RequireEntitlementGuard],
})
export class EntitlementsModule {}
