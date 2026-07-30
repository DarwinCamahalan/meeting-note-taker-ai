# services/ws-gateway/Dockerfile — @cue/ws-gateway (WS <-> gRPC edge)
#
# Multi-stage, Node 22, pnpm. See services/api/Dockerfile for the pattern.
# Build from the REPO ROOT:  docker build -f services/ws-gateway/Dockerfile .

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
RUN pnpm turbo run build --filter=@cue/ws-gateway...
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@cue/ws-gateway deploy --prod --legacy /app

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
USER node
# WS_PORT (client WebSocket edge) + METRICS_PORT (standalone /metrics /readyz
# /livez surface for this non-Nest service).
EXPOSE 3002 9464
# ws-gateway holds long-lived connections; ECS gives it a long stopTimeout so
# SIGTERM drains streams before exit (graceful shutdown wired in src/main.ts).
CMD ["node", "dist/main.js"]
