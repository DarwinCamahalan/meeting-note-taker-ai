/**
 * BillingWebhooksModule — the `billing-webhooks` logical service, shipped as a
 * hardened module INSIDE `api` in v1 (51 §5, decision A02). Imports BillingModule
 * (shared StripeService) + EntitlementsModule (the reconciler's only writer of
 * gates). Extractable to a standalone service later without changing its route.
 */
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { BillingWebhooksController } from './billing-webhooks.controller.js';
import { BillingWebhooksService } from './billing-webhooks.service.js';
import { ReconcilerService } from './reconciler.service.js';
import { WebhookDedupeStore } from './webhook-dedupe.store.js';

@Module({
  imports: [BillingModule, EntitlementsModule],
  controllers: [BillingWebhooksController],
  providers: [BillingWebhooksService, ReconcilerService, WebhookDedupeStore],
})
export class BillingWebhooksModule {}
