/**
 * ObservabilityController — the standard operational surface every Cue service
 * exposes:
 *   GET /metrics — Prometheus text exposition (scrape target).
 *   GET /livez   — shallow liveness (200 ok, or 503 when a liveness check fails).
 *   GET /readyz  — deep readiness (200 ok, or 503 while draining / dependency down).
 *
 * A non-ok readiness/liveness returns 503 with the {@link HealthReport} body so
 * the ALB target group drains (readiness) or the orchestrator restarts
 * (liveness) the task.
 */
import { Controller, Get, Header, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type { HealthRegistry, HealthReport } from '../health.js';
import { PROM_CONTENT_TYPE, type MetricsRegistry } from '../metrics.js';
import { HEALTH_REGISTRY, METRICS_REGISTRY } from './tokens.js';

@Controller()
export class ObservabilityController {
  constructor(
    @Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry,
    @Inject(HEALTH_REGISTRY) private readonly health: HealthRegistry,
  ) {}

  @Get('metrics')
  @Header('Content-Type', PROM_CONTENT_TYPE)
  async scrape(): Promise<string> {
    return this.metrics.metrics();
  }

  @Get('livez')
  async livez(): Promise<HealthReport> {
    return this.guard(await this.health.liveness());
  }

  @Get('readyz')
  async readyz(): Promise<HealthReport> {
    return this.guard(await this.health.readiness());
  }

  private guard(report: HealthReport): HealthReport {
    if (report.status === 'down') {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
