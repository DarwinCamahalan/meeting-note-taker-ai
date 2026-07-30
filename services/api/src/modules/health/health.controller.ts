/** Liveness probe. Shallow by design — does not touch Postgres. */
import { Controller, Get } from '@nestjs/common';
import { SkipRateLimit } from '../rate-limit/rate-limit.decorator.js';

interface HealthResponse {
  status: 'ok';
  service: 'api';
  ts: string;
}

@Controller()
@SkipRateLimit()
export class HealthController {
  @Get('healthz')
  health(): HealthResponse {
    return { status: 'ok', service: 'api', ts: new Date().toISOString() };
  }
}
