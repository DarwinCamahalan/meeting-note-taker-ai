# services/api/Dockerfile — @cue/api (NestJS BFF)
#
# Multi-stage, Node 22, pnpm. The `build` stage installs the whole workspace
# (frozen lockfile), builds this service + its @cue/* workspace deps via Turbo,
# then `pnpm deploy` prunes a self-contained deployment (only prod deps +
# built dist) into /app. The runtime stage carries just that — no pnpm store,
# no source, no dev deps.
#
# Build from the REPO ROOT:  docker build -f services/api/Dockerfile .

# syntax=docker/dockerfile:1.9
ARG NODE_VERSION=22

# ---- base: pinned Node + pnpm via corepack ---------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

# ---- build: install (frozen) -> turbo build -> pnpm deploy (pruned) --------
FROM base AS build
# Full workspace is needed so Turbo can build @cue/* deps of this service.
# node_modules/dist are excluded by .dockerignore so the lockfile stays honest.
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@cue/api...
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@cue/api deploy --prod /app

# ---- runtime: minimal, non-root -------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
# Drop privileges — the slim image ships an unprivileged `node` user.
USER node
# API_PORT (NestJS BFF); also serves /healthz /readyz /livez /metrics here.
EXPOSE 3001
# Liveness/readiness are exercised by the ALB target group (GET /healthz),
# not a container HEALTHCHECK (the slim image has no curl/wget).
CMD ["node", "--enable-source-maps", "dist/main.js"]
