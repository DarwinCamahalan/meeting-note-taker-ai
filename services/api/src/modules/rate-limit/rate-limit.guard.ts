/**
 * Global rate-limit guard (docs/70-scalability §5.5 per-tenant fairness).
 *
 * Keys the fixed-window counter by authenticated user (falling back to client
 * IP for unauthenticated routes) so one runaway client cannot exhaust shared
 * capacity. Emits IETF `RateLimit-*` headers on every request and a
 * `Retry-After` on rejection. Registered as an APP_GUARD but non-fatal: a
 * disabled/unreachable limiter fails open (see RateLimiterService).
 *
 * Ordering note: this guard runs on ALL routes; it must not assume a prior auth
 * guard populated `authContext`, so it degrades to an IP key when absent.
 */
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthedRequest } from '../../common/auth-context.js';
import { AppConfig } from '../../config/app-config.js';
import { AppException } from '../../common/problem-details.js';
import { RateLimiterService } from './rate-limiter.service.js';
import {
  RATE_LIMIT_RULE,
  SKIP_RATE_LIMIT,
  type RateLimitRule,
} from './rate-limit.types.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !this.limiter.enabled) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const rule = this.resolveRule(context);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const identity = this.identify(req);

    const result = await this.limiter.consume(identity, rule);

    res.setHeader('RateLimit-Limit', String(result.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetMs / 1_000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(result.resetMs / 1_000)));
      throw new AppException('RATE_LIMITED', 'Too many requests — slow down.', {
        retryAfterMs: result.resetMs,
      });
    }
    return true;
  }

  /** Per-route override, else the global default from config. */
  private resolveRule(context: ExecutionContext): RateLimitRule {
    const override = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    return override ?? { windowSec: this.config.rateLimitWindow, max: this.config.rateLimitMax };
  }

  /** Prefer the authenticated user id; fall back to the client IP. */
  private identify(req: AuthedRequest): string {
    const userId = req.authContext?.userId;
    if (userId) return `u:${userId}`;
    return `ip:${clientIp(req)}`;
  }
}

/** Resolve the client IP, honoring a single X-Forwarded-For hop behind the ALB. */
function clientIp(req: AuthedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
