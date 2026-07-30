# Cue backend services (Phase 1)

Three services sit behind the desktop app. The per-frame audio hot path is
**gRPC bidi** between `ws-gateway` and `ai-orchestrator` (Redis is kept off it);
`@cue/api` is the control-plane BFF. Run instructions live in the repo-root
[`README.md`](../README.md).

| Service | Package | Port | Stack | Primary docs |
| --- | --- | --- | --- | --- |
| API (BFF) | `@cue/api` | `:3001` (HTTP) | NestJS 11, Zod contracts, `jose` ES256, Drizzle via `@cue/db` | [`22-api-contracts.md`](../docs/22-api-contracts.md), [`40-authentication.md`](../docs/40-authentication.md), [`20-backend-services.md`](../docs/20-backend-services.md) |
| WS gateway | `@cue/ws-gateway` | `:3002` (ws) | Node `ws`, `@cue/proto` gRPC client | [`22-api-contracts.md`](../docs/22-api-contracts.md) §ws, [`02-system-architecture.md`](../docs/02-system-architecture.md) |
| AI orchestrator | `@cue/ai-orchestrator` | `:50051` (gRPC) | NestJS 11 + `@grpc/grpc-js` server wrapping `@cue/core` | [`20-backend-services.md`](../docs/20-backend-services.md), [`02-system-architecture.md`](../docs/02-system-architecture.md) |

Supporting workspaces: `@cue/db` (Drizzle schema/migrations, Postgres +
pgvector — [`30-data-model.md`](../docs/30-data-model.md)), `@cue/proto`
(`cue.orchestrator.v1` proto + typed loader), `@cue/sdk` (typed API client),
`@cue/types` (shared DTOs / WS protocol). The web surface is `@cue/web`
([`11-web-landing.md`](../docs/11-web-landing.md)).

## Request path

```
desktop ──HTTP──▶ @cue/api            (PKCE sign-in, ws ticket, sessions, /me)
desktop ──ws────▶ @cue/ws-gateway     (JWT ticket auth, binary audio + JSON control)
              └── gRPC bidi ─────────▶ @cue/ai-orchestrator ── @cue/core (Deepgram → Claude)
                     ◀── Transcript / Cue / State ─────────────┘
```

## Contract notes (MVP deviations from docs)

- **Auth** is the spec's device-code PKCE surface only — `POST /v1/auth/pkce/start`,
  `/v1/auth/pkce/exchange`, `/v1/auth/refresh`, `GET /v1/me` — not the fuller
  `/auth/token` surface described in `docs/40` & `docs/22`. The SDK codes against
  these four.
- **gRPC** uses the spec's simplified 3+3 oneof
  (`start|audio|stop` → `transcript|cue|state`), not `docs/22` §6's richer message
  set. Both `ai-orchestrator` and `ws-gateway` code against `@cue/proto`.
- Zod schemas in `@cue/api` are the **source of truth**; DTO types are derived
  into `@cue/types` — do not hand-edit the mirror.

## Phase 2 surface (`@cue/api`)

Phase 2 adds five NestJS modules to `@cue/api` (all under the existing `:3001`
BFF). RAG retrieval on the session hot path lives in `@cue/ai-orchestrator`.

### Documents (RAG ingest) — `DocumentsModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/documents` | JWT | Upload inline text → `chunkText` → embed (`voyage-3.5`, `input_type: document`) → persist `documents` + `document_chunks` (each `vector(1024)`). Returns `DocumentUploadResponse`. |
| `GET /v1/documents` | JWT | Org-scoped paginated list (`Paginated<Document>`). |
| `GET /v1/documents/:id` | JWT | Org-scoped single `Document`. |

`PgVectorSearchService` implements `@cue/core`'s `VectorSearchPort` (cosine
`1 - (embedding <=> $q)`, org filter **before** the ANN scan, `topK`/`minScore`).
The identical port is implemented in `@cue/ai-orchestrator` (`rag/`) for the
session hot path, which embeds the query (`input_type: query`), retrieves top-k
`RagChunkMatch`es, and injects them into the Claude prompt per `docs/23`.

### Billing — `BillingModule` / `BillingWebhooksModule` / `UsageModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/billing/checkout` | JWT | Stripe hosted-Checkout URL for a self-serve tier (`pro`/`team`); returns `CheckoutSessionResponse`. |
| `POST /v1/billing/portal` | JWT | Stripe Customer Portal link (`PortalLinkResponse`). |
| `GET /v1/billing/usage` | JWT | Current-period live-minute ledger + enforcement state + overage economics (`UsageSummary`). |
| `POST /v1/billing/webhook` | **Stripe-signed** (raw body) | `NestFactory({ rawBody: true })` → verify `stripe-signature` → dedupe `event.id` → reconcile `subscriptions` + `entitlements` → fast-ack `200`. Bad signature ⇒ hard `400`. |

Tier ↔ Price mapping is resolved from env in `stripe.catalog.ts` (Pro `$20`,
Team `$30/seat`, metered overage `$0.13/min`); Free/Enterprise are not
self-serve. Usage accumulates in `usage_events`, reports metered usage to
Stripe, and soft-warns / hard-caps / bills overage per `docs/50`.

### Entitlements — `EntitlementsModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/me/entitlements` | JWT | Resolved feature-gate snapshot (`EntitlementsResponse`); `version` matches the WS `entitlements.updated` bump. |

The `entitlements` table is the **source of truth** for feature gates. The
`@RequireEntitlement(key)` decorator + `RequireEntitlementGuard` (Reflector reads
`REQUIRE_ENTITLEMENT_METADATA_KEY`) gate any protected route. SDK:
`client.billing.createCheckout / portalLink / getEntitlements / usageSummary`,
`client.documents.upload / list / get`, `client.users.entitlements()`.

## Phase 3 surface (`@cue/api`)

Phase 3 adds four NestJS modules to `@cue/api` (`SsoModule`, `OrgsModule`,
`AdminModule`, plus a shared `RbacModule`) and extends `DocumentsModule` with the
team-KB routes — all under the existing `:3001` BFF. Enterprise SSO/SCIM is
backed by **WorkOS** (`@workos-inc/node`); the consumer PKCE path is untouched.
RAG on the session hot path (`@cue/ai-orchestrator`) is org-scoped and applies
the team-KB `visibility` filter before the ANN scan.

### RBAC (shared) — `RbacModule`

`@RequireRole('owner' | 'admin' | 'member')` decorator + `RequireRoleGuard`
resolve the caller's `orgMembers.role` against the route's `:orgId` (Reflector
reads `REQUIRE_ROLE_METADATA_KEY = 'cue:require-role'`), stacked after
`JwtAuthGuard`. Admin-sensitive mutations are recorded via `@Audit(...)` +
`AuditInterceptor` into the existing `audit_logs` table.

### SSO / SCIM — `SsoModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/sso/authorize` | public | `org`/`domain` → resolve the org's WorkOS connection → WorkOS AuthKit/SAML authorization URL (`SsoAuthorizeResponse`). |
| `GET /v1/sso/callback` | WorkOS redirect | Exchange `code` → WorkOS profile → find/create `users` + `orgMembers` → issue Cue ES256 JWT. Server-only (no SDK method). |
| `GET /v1/orgs/:orgId/sso/connections` | JWT + `RequireRole('owner','admin')` | List the org's SSO connections. |
| `POST /v1/orgs/:orgId/sso/connections` | JWT + `RequireRole('owner','admin')` | Create an SSO connection (`CreateSsoConnectionRequest`). |
| `DELETE /v1/orgs/:orgId/sso/connections/:connectionId` | JWT + `RequireRole('owner','admin')` | Delete an SSO connection. |
| `POST /v1/scim/webhook` | **WorkOS-signed** (raw body) | Directory-sync provisioning/deprovisioning. Verify `WORKOS_WEBHOOK_SECRET` over the raw body → `dsync.user.*` / `dsync.group.user_*` → upsert/deactivate `orgMembers`. Server-only. |

SDK: `client.sso.authorize / listConnections / createConnection / deleteConnection`.

### Orgs (invites + members) — `OrgsModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/orgs/:orgId/invites` | JWT + `RequireRole('owner','admin')` | Create an email+role invite (token). Audited `member.invite`. |
| `GET /v1/orgs/:orgId/invites` | JWT + `RequireRole('owner','admin')` | List the org's invites. |
| `GET /v1/orgs/:orgId/members` | JWT + `RequireRole('owner','admin')` | Cursor-paginated `Paginated<AdminMemberView>`. |
| `PATCH /v1/orgs/:orgId/members/:userId` | JWT + `RequireRole('owner','admin')` | Change a member's role (`UpdateMemberRequest`). Audited `member.role.update`. |
| `DELETE /v1/orgs/:orgId/members/:userId` | JWT + `RequireRole('owner','admin')` | Remove a member. Audited `member.remove`. |
| `POST /v1/invites/accept` | JWT | Accept an invite by token (`AcceptInviteRequest`) → become an `orgMembers` row. |

SDK: `client.admin.createInvite / listInvites / acceptInvite / listMembers / updateMember / removeMember`.

### Admin (overview / settings / audit) — `AdminModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/orgs/:orgId` | JWT + `RequireRole('owner','admin')` | Org overview (members, seats, entitlement snapshot). |
| `GET /v1/orgs/:orgId/settings` | JWT + `RequireRole('owner','admin')` | Org settings (`OrgSettings`). |
| `PATCH /v1/orgs/:orgId/settings` | JWT + `RequireRole('owner','admin')` | Update settings (`UpdateOrgSettingsRequest`). Audited `org.settings.update`. |
| `GET /v1/orgs/:orgId/audit-logs` | JWT + `RequireRole('owner','admin')` | Query `audit_logs` (`ListAuditLogsQuery` → `Paginated<AuditLogEntry>`). |

SDK: `client.admin.getOrgSettings / updateOrgSettings / auditLogs / seats`.

### Team KB (shared documents) — `DocumentsModule`

| Method + route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/orgs/:orgId/documents` | JWT (any member) | List the org's shared team KB (`visibility = 'org'`). |
| `DELETE /v1/orgs/:orgId/documents/:documentId` | JWT (owner/admin) | Remove a shared team-KB document. |

Retrieval (`PgVectorSearchService` in `@cue/api`, the `rag/` port in
`@cue/ai-orchestrator`) filters `c.org_id = :orgId` and
`visibility = 'org' OR user_id = :userId` **before** the cosine ANN scan, so
every member retrieves the shared KB plus their own personal docs. `POST
/v1/documents` accepts an optional `visibility` (`org` default | `personal`).

## Phase 1 TODOs (carried forward)

- **Real IdP** — the `/activate` flow auto-approves a dev user. Swap for
  Clerk/WorkOS. `TODO(real IdP)`.
- **KMS JWT signing** — production must sign via KMS asymmetric (ECC_NIST_P256),
  not the local dev ES256 keypair in `.env`. `TODO(prod: KMS)` per `docs/40`.
- **Redis device-code / ticket store** — `@cue/api` uses an in-memory device-code
  store and the gateway an in-memory replay/offset store; both must move to Redis
  for multi-instance deploys.
- **Envelope encryption** — content columns (`transcript_segments.content`,
  `transcripts.summary`, `document_chunks.content`) store plaintext in MVP;
  KMS envelope encryption is a documented follow-up per `docs/05`/`docs/30`.
- **gRPC / ws end-to-end test** — no integration test yet exercises
  desktop → ws-gateway → ai-orchestrator → back. Add one before relying on the
  gateway path.
- **Postgres provisioning** — local dev uses the `pgvector/pgvector:pg16` Docker
  image; provision a managed Postgres 16 + pgvector (and prefer the `pg_uuidv7`
  extension over the SQL `uuidv7()` shim in migration `0000`) for real
  environments.
