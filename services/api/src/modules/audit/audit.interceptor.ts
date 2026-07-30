/**
 * AuditInterceptor — records admin-sensitive mutations declaratively. On a
 * handler tagged with `@Audit(...)`, it waits for a successful response, then
 * writes one {@link AuditEvent} carrying the actor (from `req.authContext`),
 * the target (from a route param or a response field), and the request's IP +
 * user-agent. Errors short-circuit before `tap` runs, so denied/failed
 * requests are never audited.
 *
 * Wire per-controller with `@UseInterceptors(AuditInterceptor)`; it is inert on
 * handlers without `@Audit(...)`.
 */
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import type { AuthedRequest } from '../../common/auth-context.js';
import { AUDIT_METADATA_KEY, type AuditMetadata } from './audit.decorator.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    return next.handle().pipe(
      tap((response: unknown) => {
        // Fire-and-forget: recording must never delay or fail the response.
        void this.audit.record({
          orgId: orgIdOf(req),
          action: meta.action,
          actorUserId: req.authContext?.userId ?? null,
          targetType: meta.targetType ?? null,
          targetId: targetIdOf(req, response, meta),
          ip: req.ip ?? null,
          userAgent: headerOf(req, 'user-agent'),
        });
      }),
    );
  }
}

function orgIdOf(req: AuthedRequest): string {
  const params = req.params as Record<string, string | undefined>;
  return params['orgId'] ?? req.authContext?.orgId ?? '';
}

function targetIdOf(
  req: AuthedRequest,
  response: unknown,
  meta: AuditMetadata,
): string | null {
  if (meta.targetParam) {
    const params = req.params as Record<string, string | undefined>;
    const fromParam = params[meta.targetParam];
    if (fromParam) return fromParam;
  }
  if (meta.targetResponseField && response && typeof response === 'object') {
    const value = (response as Record<string, unknown>)[meta.targetResponseField];
    if (typeof value === 'string') return value;
  }
  return null;
}

function headerOf(req: AuthedRequest, name: string): string | null {
  const value = req.headers[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return null;
}
