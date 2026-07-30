import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ORCHESTRATOR_CONFIG, loadOrchestratorEnv } from './config/env.js';
import { GrpcServerService } from './grpc/grpc-server.service.js';
import {
  CUE_LOGGER,
  HEALTH_REGISTRY,
  METRICS_REGISTRY,
  createObservabilityProviders,
} from './observability/telemetry.js';
import { AdmissionControlService } from './admission/admission-control.service.js';
import { OrchestratorService } from './orchestrator/orchestrator.service.js';
import { RagService } from './rag/rag.service.js';

/**
 * The lean ai-orchestrator application: config loading + observability
 * singletons + the pipeline factory + the gRPC server. No HTTP layer for
 * application traffic (this service speaks only gRPC to ws-gateway); the
 * `/metrics` + probe surface is a standalone listener started in `main.ts`.
 *
 * `envFilePath` checks the service dir then the monorepo root so `pnpm dev`
 * from either location picks up the shared `.env`.
 */
const observability = createObservabilityProviders();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
  ],
  providers: [
    { provide: ORCHESTRATOR_CONFIG, useFactory: () => loadOrchestratorEnv() },
    ...observability.providers,
    RagService,
    AdmissionControlService,
    OrchestratorService,
    GrpcServerService,
  ],
  exports: [METRICS_REGISTRY, HEALTH_REGISTRY, CUE_LOGGER],
})
export class AppModule {}
