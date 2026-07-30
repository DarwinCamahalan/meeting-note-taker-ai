/**
 * `GET /v1/me/entitlements` — the resolved feature-gate snapshot the desktop
 * app and ws-gateway gate on. `version` matches the WS `entitlements.updated`
 * bump so clients know when to re-fetch.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { EntitlementsResponse } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EntitlementsService } from './entitlements.service.js';

@Controller('v1/me')
@UseGuards(JwtAuthGuard)
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('entitlements')
  getEntitlements(@CurrentUser() ctx: AuthContext): Promise<EntitlementsResponse> {
    return this.entitlements.resolve(ctx.orgId);
  }
}
