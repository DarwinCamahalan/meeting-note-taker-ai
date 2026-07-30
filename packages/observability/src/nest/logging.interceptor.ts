/**
 * LoggingInterceptor — one structured pino line per HTTP request with method,
 * matched route, status, and duration. Trace ids are attached automatically by
 * the logger's OTel mixin. Deliberately logs NO request body, query, or headers
 * (PII rule, 61-observability §8).
 */
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import type { CueLogger } from '../logger.js';
import { CUE_LOGGER } from './tokens.js';

interface HttpRequestLike {
  method?: string;
  url?: string;
  route?: { path?: string };
}

interface HttpResponseLike {
  statusCode?: number;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: CueLogger;

  constructor(@Inject(CUE_LOGGER) logger: CueLogger) {
    this.logger = logger.child({ scope: 'http' });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();
    const method = req.method ?? 'UNKNOWN';
    const route = req.route?.path ?? req.url ?? 'unknown';
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.log(method, route, res.statusCode ?? 0, start),
        error: (error: unknown) => this.log(method, route, statusOf(error, res), start, error),
      }),
    );
  }

  private log(method: string, route: string, status: number, start: bigint, error?: unknown): void {
    const durationMs = Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100;
    const fields = { method, route, status, durationMs };
    if (error) {
      this.logger.error({ ...fields, err: errName(error) }, 'request failed');
    } else if (status >= 500) {
      this.logger.error(fields, 'request 5xx');
    } else {
      this.logger.info(fields, 'request');
    }
  }
}

function statusOf(error: unknown, res: HttpResponseLike): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
}

function errName(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}
