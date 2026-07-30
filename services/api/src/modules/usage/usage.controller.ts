/**
 * `GET /v1/billing/usage` — the current billing period's live-minute ledger,
 * enforcement state, and overage economics. Drives the desktop usage meter and
 * the pre-session quota check.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { UsageSummary } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsageService } from './usage.service.js';

@Controller('v1/billing')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('usage')
  usageSummary(@CurrentUser() ctx: AuthContext): Promise<UsageSummary> {
    return this.usage.summarize(ctx.orgId);
  }
}
