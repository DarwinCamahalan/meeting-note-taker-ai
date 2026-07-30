/** Liveness probe. Shallow by design — does not touch Postgres. */
import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  service: 'api';
  ts: string;
}

@Controller()
export class HealthController {
  @Get('healthz')
  health(): HealthResponse {
    return { status: 'ok', service: 'api', ts: new Date().toISOString() };
  }
}
