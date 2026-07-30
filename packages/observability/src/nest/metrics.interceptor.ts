/**
 * MetricsInterceptor — records `api_request_duration_ms` (labelled route/method/
 * status) and increments `api_5xx_total` on server errors, for every HTTP
 * handler. The route label uses the MATCHED express route template (not the raw
 * URL) to bound Prometheus label cardinality.
 */
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import type { MetricsRegistry } from '../metrics.js';
import { METRICS_REGISTRY } from './tokens.js';

interface HttpRequestLike {
  method?: string;
  url?: string;
  route?: { path?: string };
}

interface HttpResponseLike {
  statusCode?: number;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();
    const method = req.method ?? 'UNKNOWN';
    const start = process.hrtime.bigint();

    const record = (): void => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route?.path ?? 'unmatched';
      const status = String(res.statusCode ?? 0);
      this.metrics.sli.apiRequestDurationMs.observe({ route, method, status }, durationMs);
      if ((res.statusCode ?? 0) >= 500) {
        this.metrics.sli.api5xxTotal.inc({ route });
      }
    };

    return next.handle().pipe(
      tap({
        next: record,
        error: record,
      }),
    );
  }
}
