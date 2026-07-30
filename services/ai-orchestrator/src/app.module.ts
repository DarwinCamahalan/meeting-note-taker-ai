import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ORCHESTRATOR_CONFIG, loadOrchestratorEnv } from './config/env.js';
import { GrpcServerService } from './grpc/grpc-server.service.js';
import { OrchestratorService } from './orchestrator/orchestrator.service.js';

/**
 * The lean ai-orchestrator application: config loading + the pipeline factory +
 * the gRPC server. No HTTP layer (this service speaks only gRPC to ws-gateway).
 *
 * `envFilePath` checks the service dir then the monorepo root so `pnpm dev`
 * from either location picks up the shared `.env`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
  ],
  providers: [
    { provide: ORCHESTRATOR_CONFIG, useFactory: () => loadOrchestratorEnv() },
    OrchestratorService,
    GrpcServerService,
  ],
})
export class AppModule {}
