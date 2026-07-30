/**
 * BillingService — initiates billing actions against Stripe. It NEVER writes
 * entitlements from a synchronous Stripe response; the webhook reconciler is the
 * authority (51-payments-stripe.md §1). This service only:
 *   - creates hosted Checkout sessions (base licensed price + metered overage),
 *   - mints Customer Portal links,
 * both keyed to an idempotently-ensured Stripe Customer stored on the org.
 */
import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { orgs } from '@cue/db';
import type { CheckoutSessionResponse, PortalLinkResponse } from '@cue/types';
import { AppConfig } from '../../config/app-config.js';
import type { AuthContext } from '../../common/auth-context.js';
import { AppException, conflict, notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type { CheckoutSessionRequestDto } from '../../contracts/index.js';
import { checkoutPriceSet, StripeConfigError } from './stripe.catalog.js';
import { StripeService } from './stripe.service.js';

/** Pro ships a 14-day trial on the card-on-file Checkout path (50 §7.1). */
const PRO_TRIAL_DAYS = 14;

@Injectable()
export class BillingService {
  constructor(
    private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly stripe: StripeService,
  ) {}

  /** Start a Stripe-hosted Checkout session for a self-serve tier. */
  async createCheckout(
    ctx: AuthContext,
    dto: CheckoutSessionRequestDto,
  ): Promise<CheckoutSessionResponse> {
    const prices = this.mapConfigErrors(() => checkoutPriceSet(this.config, dto.tier));
    const customerId = await this.ensureCustomer(ctx);
    const seats = dto.tier === 'team' ? (dto.seats ?? 1) : 1;

    const baseItem: Stripe.Checkout.SessionCreateParams.LineItem = prices.perSeat
      ? { price: prices.basePriceId, quantity: seats }
      : { price: prices.basePriceId };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: ctx.orgId,
      line_items: [baseItem, { price: prices.overagePriceId }],
      allow_promotion_codes: true,
      success_url: dto.successUrl ?? `${this.config.webBaseUrl}/billing/success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: dto.cancelUrl ?? `${this.config.webBaseUrl}/pricing`,
      subscription_data: {
        metadata: { orgId: ctx.orgId, userId: ctx.userId, tier: dto.tier },
        ...(dto.tier === 'pro' ? { trial_period_days: PRO_TRIAL_DAYS } : {}),
      },
    };

    const session = await this.stripe.stripe.checkout.sessions.create(params);
    if (!session.url) {
      throw new AppException('UPSTREAM_BILLING', 'Stripe did not return a Checkout URL.');
    }
    return { url: session.url, sessionId: session.id };
  }

  /** Mint a Stripe Customer Portal link for self-serve plan/payment management. */
  async portalLink(ctx: AuthContext): Promise<PortalLinkResponse> {
    const customerId = await this.existingCustomerId(ctx.orgId);
    if (!customerId) {
      throw conflict('No Stripe customer for this org yet — start a subscription first.');
    }

    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${this.config.webBaseUrl}/account/billing`,
      ...(this.config.stripePortalConfigId
        ? { configuration: this.config.stripePortalConfigId }
        : {}),
    };

    const session = await this.mapConfigErrorsAsync(() =>
      this.stripe.stripe.billingPortal.sessions.create(params),
    );
    return { url: session.url };
  }

  /* ----------------------------- internals ----------------------------- */

  private async ensureCustomer(ctx: AuthContext): Promise<string> {
    const org = await this.loadOrg(ctx.orgId);
    const customerId = await this.mapConfigErrorsAsync(() =>
      this.stripe.ensureCustomer({
        orgId: ctx.orgId,
        email: ctx.email,
        orgName: org.name,
        existingCustomerId: org.stripeCustomerId,
      }),
    );
    if (customerId !== org.stripeCustomerId) {
      await this.db.db
        .update(orgs)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(orgs.id, ctx.orgId));
    }
    return customerId;
  }

  private async existingCustomerId(orgId: string): Promise<string | null> {
    const org = await this.loadOrg(orgId);
    return org.stripeCustomerId;
  }

  private async loadOrg(orgId: string): Promise<{ name: string; stripeCustomerId: string | null }> {
    const [org] = await this.db.db
      .select({ name: orgs.name, stripeCustomerId: orgs.stripeCustomerId })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);
    if (!org) {
      throw notFound('Org not found.');
    }
    return org;
  }

  /** Translate a missing-config error into a clean 502 problem+json. */
  private mapConfigErrors<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      throw this.toBillingError(err);
    }
  }

  private async mapConfigErrorsAsync<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.toBillingError(err);
    }
  }

  private toBillingError(err: unknown): unknown {
    if (err instanceof StripeConfigError) {
      return new AppException('UPSTREAM_BILLING', err.message);
    }
    return err;
  }
}
