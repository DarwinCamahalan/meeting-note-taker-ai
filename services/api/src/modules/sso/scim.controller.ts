/**
 * `POST /v1/scim/webhook` — the WorkOS Directory Sync (SCIM) receiver.
 *
 * UNAUTHENTICATED (WorkOS is not a Cue user) but SIGNATURE-VERIFIED against
 * WORKOS_WEBHOOK_SECRET using the `workos-signature` header. The WorkOS SDK
 * recomputes the HMAC from the PARSED JSON body, so we hand it `req.body` (not
 * the raw bytes). Flow: verify -> provision/deprovision idempotently -> ack 200.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScimService } from './scim.service.js';

interface WebhookAck {
  received: boolean;
}

@Controller('v1/scim')
export class ScimController {
  constructor(private readonly scim: ScimService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() payload: unknown,
    @Headers('workos-signature') signature: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WebhookAck | { error: string }> {
    if (!payload || !signature) {
      res.status(HttpStatus.BAD_REQUEST);
      return { error: 'Missing body or workos-signature header.' };
    }

    const result = await this.scim.process(payload, signature);
    if (!result.ok) {
      // A bad signature is a hard 400; a valid event that failed to apply still
      // acks 200 (handled inside the service) so WorkOS does not retry-storm.
      res.status(HttpStatus.BAD_REQUEST);
      return { error: result.error };
    }
    return { received: true };
  }
}
