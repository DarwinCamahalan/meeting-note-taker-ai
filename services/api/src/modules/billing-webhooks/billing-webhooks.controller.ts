/**
 * `POST /v1/billing/webhook` — the Stripe -> entitlements bridge (51 §5).
 *
 * UNAUTHENTICATED (Stripe is not a Cue user) but SIGNATURE-VERIFIED against the
 * RAW request body: NestFactory is booted with `rawBody: true` so `req.rawBody`
 * is the exact bytes Stripe signed. Any parsed-JSON body would break the HMAC.
 * Flow: verify signature -> dedupe(event.id) -> reconcile -> fast-ack 200.
 */
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BillingWebhooksService } from './billing-webhooks.service.js';

interface WebhookAck {
  received: boolean;
}

@Controller('v1/billing')
export class BillingWebhooksController {
  constructor(private readonly webhooks: BillingWebhooksService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WebhookAck | { error: string }> {
    const rawBody = req.rawBody;
    if (!rawBody || !signature) {
      res.status(HttpStatus.BAD_REQUEST);
      return { error: 'Missing raw body or stripe-signature header.' };
    }

    const result = await this.webhooks.process(rawBody, signature);
    if (!result.ok) {
      // Non-2xx makes Stripe retry; a bad signature is a hard 400.
      res.status(HttpStatus.BAD_REQUEST);
      return { error: result.error };
    }
    return { received: true };
  }
}
