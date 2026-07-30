/**
 * UsageModule — live-minute metering ledger + Stripe overage reporting. Imports
 * BillingModule for the shared {@link StripeService}. Exports {@link UsageService}
 * so `ws-gateway`-facing internals (or a metering worker) can record minutes.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { UsageController } from './usage.controller.js';
import { UsageService } from './usage.service.js';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
