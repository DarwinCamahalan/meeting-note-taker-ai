/**
 * Billing HTTP surface (authenticated):
 *   POST /v1/billing/checkout  -> Stripe-hosted Checkout URL
 *   POST /v1/billing/portal    -> Stripe Customer Portal link
 * Usage (`GET /v1/billing/usage`) lives in the UsageController and the webhook
 * (`POST /v1/billing/webhook`) in BillingWebhooksController — both share this
 * route prefix but are wired in their own modules.
 */
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { CheckoutSessionResponse, PortalLinkResponse } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  CheckoutSessionRequestSchema,
  type CheckoutSessionRequestDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillingService } from './billing.service.js';

@Controller('v1/billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentUser() ctx: AuthContext,
    @Body(new ZodValidationPipe(CheckoutSessionRequestSchema)) body: CheckoutSessionRequestDto,
  ): Promise<CheckoutSessionResponse> {
    return this.billing.createCheckout(ctx, body);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  portal(@CurrentUser() ctx: AuthContext): Promise<PortalLinkResponse> {
    return this.billing.portalLink(ctx);
  }
}
