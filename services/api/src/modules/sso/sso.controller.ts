/**
 * SSO login endpoints (PUBLIC — pre-authentication).
 *  - `GET /v1/sso/authorize` returns the WorkOS authorization URL (JSON) for the
 *    web app's "Sign in with SSO" entrypoint.
 *  - `GET /v1/sso/callback` is where WorkOS redirects the browser after auth; it
 *    exchanges the code, mints first-party tokens, and 302-redirects back to the
 *    web app with the tokens in the URL fragment (never a query string, so they
 *    are not sent to the server or logged).
 *
 * The consumer PKCE routes in AuthController are unaffected.
 */
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthTokens, SsoAuthorizeResponse } from '@cue/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AppConfig } from '../../config/app-config.js';
import {
  SsoAuthorizeQuerySchema,
  SsoCallbackQuerySchema,
  type SsoAuthorizeQueryDto,
  type SsoCallbackQueryDto,
} from '../../contracts/index.js';
import { SsoService } from './sso.service.js';

@Controller('v1/sso')
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly config: AppConfig,
  ) {}

  @Get('authorize')
  authorize(
    @Query(new ZodValidationPipe(SsoAuthorizeQuerySchema)) query: SsoAuthorizeQueryDto,
  ): Promise<SsoAuthorizeResponse> {
    return this.sso.authorize(query);
  }

  @Get('callback')
  async callback(
    @Query(new ZodValidationPipe(SsoCallbackQuerySchema)) query: SsoCallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    if (query.error || !query.code) {
      res.redirect(this.errorRedirect(query.error ?? 'missing_code'));
      return;
    }

    try {
      const result = await this.sso.handleCallback(query.code);
      res.redirect(this.successRedirect(result.tokens, query.state));
    } catch {
      // Never surface raw errors to the browser redirect; the web app renders a
      // generic SSO failure. Details are logged server-side by the services.
      res.redirect(this.errorRedirect('exchange_failed'));
    }
  }

  private successRedirect(tokens: AuthTokens, state?: string): string {
    const fragment = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: String(tokens.expires_in),
    });
    if (state) fragment.set('state', state);
    return `${this.config.webBaseUrl}/sso/callback#${fragment.toString()}`;
  }

  private errorRedirect(reason: string): string {
    const query = new URLSearchParams({ sso_error: reason });
    return `${this.config.webBaseUrl}/login?${query.toString()}`;
  }
}
