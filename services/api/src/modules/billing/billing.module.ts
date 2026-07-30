/**
 * BillingModule — Stripe Checkout + Customer Portal initiation. Owns the shared
 * {@link StripeService} and exports it so BillingWebhooksModule + UsageModule
 * reuse the single configured Stripe client.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { StripeService } from './stripe.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, StripeService],
  exports: [StripeService],
})
export class BillingModule {}
