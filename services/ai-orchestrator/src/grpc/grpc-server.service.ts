import { addOrchestratorService, grpc } from '@cue/proto';
import type {
  ClientEnvelope,
  OrchestratorHandlers,
  ServerEnvelope,
} from '@cue/proto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ORCHESTRATOR_CONFIG, type OrchestratorEnv } from '../config/env.js';
import { OrchestratorService } from '../orchestrator/orchestrator.service.js';
import { StreamSession } from '../orchestrator/stream-session.js';

/**
 * Owns the `@grpc/grpc-js` server lifecycle. Nest starts it on module init and
 * gracefully drains it on shutdown (`enableShutdownHooks` in main.ts). Each
 * inbound `Orchestrator.Stream` call is delegated to a {@link StreamSession}.
 *
 * Uses an insecure channel (internal same-VPC hop per the locked gRPC hot-path
 * decision). TODO(prod): terminate TLS via ECS Service Connect / mTLS.
 */
@Injectable()
export class GrpcServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrpcServerService.name);
  private server: grpc.Server | undefined;

  constructor(
    @Inject(ORCHESTRATOR_CONFIG) private readonly config: OrchestratorEnv,
    private readonly orchestrators: OrchestratorService,
  ) {}

  async onModuleInit(): Promise<void> {
    const server = new grpc.Server();
    addOrchestratorService(server, this.handlers());
    await bind(server, this.config.grpcAddr);
    this.server = server;
    this.logger.log(`Orchestrator gRPC server listening on ${this.config.grpcAddr}`);
  }

  async onModuleDestroy(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => {
      server.tryShutdown((err?: Error) => {
        if (err) {
          this.logger.warn(`graceful shutdown failed; forcing: ${err.message}`);
          server.forceShutdown();
        }
        resolve();
      });
    });
    this.logger.log('Orchestrator gRPC server stopped');
  }

  private handlers(): OrchestratorHandlers {
    return {
      Stream: (call: grpc.ServerDuplexStream<ClientEnvelope, ServerEnvelope>) => {
        const session = new StreamSession(call, () => this.orchestrators.create());
        call.on('data', (envelope: ClientEnvelope) => session.handleEnvelope(envelope));
        call.on('end', () => {
          void session.finish();
        });
        call.on('error', (err: Error) => {
          void session.abort(err);
        });
        call.on('cancelled', () => {
          void session.abort();
        });
      },
    };
  }
}

/** Resolve once the server is bound (or reject with a clear bind error). */
function bind(server: grpc.Server, addr: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err: Error | null, port: number) => {
      if (err) {
        reject(err);
        return;
      }
      if (port === 0) {
        reject(new Error(`[ai-orchestrator] failed to bind gRPC server to ${addr}`));
        return;
      }
      resolve();
    });
  });
}
