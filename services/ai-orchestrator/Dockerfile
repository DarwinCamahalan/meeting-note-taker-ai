# services/ai-orchestrator/Dockerfile — @cue/ai-orchestrator (gRPC + RAG)
#
# Multi-stage, Node 22, pnpm. See services/api/Dockerfile for the pattern.
# Build from the REPO ROOT:  docker build -f services/ai-orchestrator/Dockerfile .

# syntax=docker/dockerfile:1.9
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@cue/ai-orchestrator...
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@cue/ai-orchestrator deploy --prod /app

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
USER node
# ORCHESTRATOR_GRPC_ADDR bind port (gRPC bidi hot path) + METRICS_PORT
# (standalone /metrics /readyz /livez for this non-Nest service).
EXPOSE 50051 9464
# Drains in-flight streams on SIGTERM (enableShutdownHooks in src/main.ts);
# ECS stopTimeout is set high (120s) so a live meeting finishes mid-stream.
CMD ["node", "dist/main.js"]
