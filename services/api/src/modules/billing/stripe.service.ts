/**
 * StripeService — owns the single configured Stripe client for the process and
 * exposes the low-level primitives BillingService + the webhook reconciler need
 * (client access, raw-body signature verification, ensure-customer, metered
 * usage reporting). It is the only place `new Stripe(...)` is constructed.
 */
import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfig } from '../../config/app-config.js';
import { StripeConfigError } from './stripe.catalog.js';

/** Stripe API version this service is written against (typed request shapes). */
const STRIPE_API_VERSION = '2025-02-24.acacia';

@Injectable()
export class StripeService {
  private readonly client: Stripe | null;

  constructor(private readonly config: AppConfig) {
    this.client = config.stripeSecretKey
      ? new Stripe(config.stripeSecretKey, { apiVersion: STRIPE_API_VERSION })
      : null;
  }

  /** The configured Stripe client, or a fail-loud error when unconfigured. */
  get stripe(): Stripe {
    if (!this.client) {
      throw new StripeConfigError('Stripe is not configured (set STRIPE_SECRET_KEY).');
    }
    return this.client;
  }

  /** Whether billing is configured at all (used to fail closed cleanly). */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Verify a raw webhook body against the signing secret and construct the
   * typed event. Throws when the signature (or the secret) is invalid — the
   * caller maps that to a 400.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.config.stripeWebhookSecret) {
      throw new StripeConfigError('Stripe webhooks are not configured (set STRIPE_WEBHOOK_SECRET).');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.stripeWebhookSecret,
    );
  }

  /**
   * Idempotently ensure a Stripe Customer exists for a billing subject (an org).
   * Reuses `existingCustomerId` when present; otherwise creates one tagged with
   * `orgId` metadata so webhooks can attribute events back to the org.
   */
  async ensureCustomer(params: {
    orgId: string;
    email: string;
    orgName: string;
    existingCustomerId: string | null;
  }): Promise<string> {
    if (params.existingCustomerId) {
      return params.existingCustomerId;
    }
    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.orgName,
      metadata: { orgId: params.orgId },
    });
    return customer.id;
  }

  /**
   * Report billable overage minutes to Stripe's metered subscription item.
   * `idempotencyKey` (derived from the session id) guarantees a retried report
   * never double-bills; Stripe sums records across the period.
   */
  async reportOverageUsage(params: {
    subscriptionItemId: string;
    quantity: number;
    timestampUnix: number;
    idempotencyKey: string;
  }): Promise<string> {
    const record = await this.stripe.subscriptionItems.createUsageRecord(
      params.subscriptionItemId,
      {
        quantity: params.quantity,
        timestamp: params.timestampUnix,
        action: 'increment',
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return record.id;
  }
}
