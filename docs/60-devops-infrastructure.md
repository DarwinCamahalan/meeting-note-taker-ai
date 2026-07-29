# DevOps & Infrastructure

> Status: Draft · Owner: Principal Architect (Infrastructure & Delivery) · Last updated: 2026-07-29 · Related: [System architecture](02-system-architecture.md) · [Backend services](20-backend-services.md) · [Data model](30-data-model.md) · [Web landing](11-web-landing.md) · [Desktop app](10-desktop-app.md) · [Observability](61-observability.md) · [Scalability](70-scalability.md) · [Unit economics](71-unit-economics.md)

This doc owns how **Cue** is hosted, provisioned, and delivered: the AWS topology, Terraform layout, environments and promotion, the three CI/CD pipelines (web, backend services, and the desktop release + code-signing pipeline), secrets, backups, and disaster recovery. It does not define scaling policy in depth ([Scalability](70-scalability.md)) or the metric/alert catalog ([Observability](61-observability.md)) — it links to them.

---

## 1. Principles

1. **Everything is Terraform.** No console clicks in staging or prod. The only manual bootstrap is the Terraform state backend itself (§4.1) and root-account break-glass.
2. **Two regions, one control plane.** `us-east-1` is primary; `eu-west-1` serves EU-resident data ([Data model §data-residency](30-data-model.md)). Regions are symmetric Terraform module instantiations, not bespoke stacks.
3. **Immutable artifacts, promoted not rebuilt.** A container image or a signed installer built once in CI is the exact bytes promoted dev → staging → prod. We promote a digest, never rebuild per environment.
4. **Least privilege by default.** Each ECS task has its own IAM task role scoped to the exact secrets/buckets/queues it needs. CI uses GitHub OIDC federation — no long-lived AWS keys in GitHub.
5. **The desktop release pipeline is a first-class product surface.** A mis-signed or un-notarized build is a P1 — it blocks every user's ability to install/update. It gets the same rigor as prod backend deploys.

---

## 2. AWS topology

Cue runs on AWS ECS Fargate behind an ALB in each region, with a serverless-leaning data tier. The web marketing site is on Vercel (not AWS) and is covered in §6.1; installers and the update feed live on Cloudflare R2 + CDN so downloads never touch AWS egress (a deliberate COGS choice — see [Unit economics](71-unit-economics.md)).

```mermaid
graph TB
  subgraph Client
    D[desktop<br/>Electron app]
    B[Browser<br/>marketing + app]
  end

  subgraph Edge
    CF[CloudFront CDN<br/>api.cue.app]
    R53[Route53<br/>latency + failover routing]
    R2[Cloudflare R2 + CDN<br/>installers + latest*.yml]
    VER[Vercel<br/>web marketing site]
  end

  subgraph "AWS us-east-1 (primary)"
    direction TB
    ALB1[ALB :443]
    subgraph "VPC 10.0.0.0/16"
      subgraph "Public subnets"
        NAT1[NAT GW x2]
      end
      subgraph "Private app subnets"
        API1[ECS: api<br/>NestJS BFF]
        WS1[ECS: ws-gateway<br/>uWebSockets]
        AIO1[ECS: ai-orchestrator<br/>STT+LLM+RAG]
        ENT1[ECS: entitlements]
        BWH1[ECS: billing-webhooks]
      end
      subgraph "Private data subnets"
        AUR1[(Aurora Serverless v2<br/>Postgres 16 + pgvector)]
        RED1[(ElastiCache Redis<br/>cluster mode)]
      end
    end
    SM1[Secrets Manager]
    S3B1[S3: backups + uploads]
  end

  subgraph "AWS eu-west-1 (EU residency)"
    ALB2[ALB :443]
    API2[ECS services...]
    AUR2[(Aurora v2 + pgvector)]
    RED2[(ElastiCache Redis)]
    S3B2[S3: backups + uploads]
  end

  D -->|OAuth PKCE, REST| CF
  D -->|WSS live audio| CF
  B --> VER
  D -->|auto-update check| R2
  VER -->|download link| R2

  CF --> R53
  R53 --> ALB1
  R53 -.->|failover / EU residency| ALB2

  ALB1 --> API1 & WS1
  WS1 --> AIO1
  API1 --> ENT1
  API1 --> AUR1
  AIO1 --> AUR1
  API1 --> RED1
  WS1 --> RED1
  AIO1 -->|external STT/LLM| EXT[Deepgram · Anthropic · Voyage]
  BWH1 -->|Stripe events| ENT1
  API1 --> SM1
  AUR1 -->|snapshots + PITR| S3B1

  ALB2 --> API2
  API2 --> AUR2 & RED2
  AUR2 --> S3B2
```

### 2.1 Network layout (per region)

| Layer | CIDR (us-east-1) | Contents | Egress |
|---|---|---|---|
| Public subnets (2 AZ) | 10.0.0.0/24, 10.0.1.0/24 | ALB, NAT gateways | Internet GW |
| Private app subnets (2 AZ) | 10.0.10.0/24, 10.0.11.0/24 | All ECS Fargate tasks | via NAT |
| Private data subnets (2 AZ) | 10.0.20.0/24, 10.0.21.0/24 | Aurora, ElastiCache | none (VPC endpoints only) |

- **Two AZs minimum** per region for the ALB, Fargate spread, Aurora, and Redis (multi-AZ). Three AZs in prod us-east-1.
- **VPC endpoints** (interface + gateway) for S3, Secrets Manager, ECR, CloudWatch Logs so data-subnet traffic to AWS services never traverses the NAT/Internet.
- **Security groups** are the primary firewall: ALB SG → app SG :3000-3002; app SG → data SG :5432/:6379 only. No SG allows 0.0.0.0/0 inbound except the ALB on :443.
- `eu-west-1` uses 10.1.0.0/16 with the identical subnet shape.

### 2.2 Compute — ECS Fargate services

Each [canonical service](02-system-architecture.md#canonical-service-names) is one ECS service. Fargate (not EC2) because we do not want to manage a node fleet and our load is bursty. `ai-orchestrator` and `ws-gateway` are the latency-critical, connection-heavy services and get the most headroom.

| Service | Port | Task size (prod baseline) | Min/Max tasks | Scale signal | Health check |
|---|---|---|---|---|---|
| `api` (NestJS BFF) | 3000 | 0.5 vCPU / 1 GB | 3 / 20 | ALB req count + CPU | `GET /healthz` |
| `ws-gateway` | 3001 | 1 vCPU / 2 GB | 3 / 40 | active WS connections (custom CW metric) | TCP + `GET /healthz` |
| `ai-orchestrator` | 3002 | 2 vCPU / 4 GB | 3 / 60 | in-flight streams + CPU | `GET /healthz` |
| `entitlements` | 3003 | 0.25 vCPU / 0.5 GB | 2 / 6 | CPU | `GET /healthz` |
| `billing-webhooks` | 3004 | 0.25 vCPU / 0.5 GB | 2 / 4 | SQS/ALB queue depth | `GET /healthz` |

Scaling policy detail (target-tracking values, connection draining, warm pools) lives in [Scalability §autoscaling](70-scalability.md). ECS deployment strategy is in §6.2.

### 2.3 Data tier

- **PostgreSQL 16 on Aurora Serverless v2** (primary choice for prod) with the `pgvector` extension for RAG embeddings. ACU range 0.5–16 in staging, 2–32 in prod. Rationale in ADR-INF-01. **Neon** is the accepted alternative for dev/preview branches — its instant branching is used for per-PR ephemeral databases; prod stays on Aurora for VPC isolation and predictable IOPS.
- **Redis via ElastiCache** (cluster mode enabled, multi-AZ, automatic failover) for cache, rate limiting, session store, and BullMQ job queues. **Upstash** is the alternative used only for Vercel-side/edge needs where a serverless HTTP Redis is convenient; the backend uses ElastiCache in-VPC.
- **Object storage:** installers + `latest*.yml` on **Cloudflare R2** (zero egress fees, fronted by Cloudflare CDN). User uploads (resume/JD/knowledge base) + DB backups on **S3** per region (in-VPC via gateway endpoint, SSE-KMS encrypted). See [Data model](30-data-model.md) for bucket key layout and lifecycle.
- **ClickHouse** (optional, Phase 2) for product-analytics events, fed from PostHog/warehouse — not on the request path.

---

## 3. ADRs

### ADR-INF-01 — Aurora Serverless v2 as primary Postgres
- **Decision:** Prod Postgres is Aurora Serverless v2 with pgvector; Neon is used for dev/preview branches only.
- **Context:** Bursty load (meetings cluster in business hours across timezones), need pgvector, need VPC isolation, need predictable PITR/DR, and want cheap ephemeral per-PR DBs.
- **Alternatives:** All-Neon (great DX + branching, but external to VPC, egress + data-residency friction, less control over IOPS); self-managed Postgres on RDS provisioned (no true scale-to-low, over-provisioned off-hours); RDS + separate vector DB (Pinecone) (extra system, extra cost, split consistency).
- **Trade-offs:** Aurora v2 has a non-zero floor cost (min ACU) and scales in ~15s steps, not instant; Neon branching DX is better. We accept the floor for VPC isolation, KMS, and DR maturity.
- **Consequence:** One Postgres engine, pgvector co-located with relational data (no cross-store joins for RAG), Neon reserved for dev velocity.

### ADR-INF-02 — Installers + update feed on Cloudflare R2, not S3/CloudFront
- **Decision:** Signed installers and `latest*.yml` are served from R2 behind Cloudflare CDN.
- **Context:** Installers are 90–180 MB; every install and every auto-update GETs them. Egress at scale is the single largest infra line item candidate.
- **Alternatives:** S3 + CloudFront (integrated with our AWS IaC, but per-GB egress is materially higher); GitHub Releases (rate-limited, no custom domain, weak for enterprise allowlisting).
- **Trade-offs:** R2 is a second cloud vendor in the stack (operational surface, separate IAM/Terraform provider). We accept it because zero-egress economics dominate at our download volume ([Unit economics](71-unit-economics.md)).
- **Consequence:** `electron-updater` points at `https://dl.cue.app` (R2 custom domain); the desktop release pipeline (§7) publishes there.

### ADR-INF-03 — GitHub OIDC federation, no static AWS keys in CI
- **Decision:** GitHub Actions assumes short-lived AWS roles via OIDC; no `AWS_ACCESS_KEY_ID` secrets stored in GitHub.
- **Context:** Long-lived keys in CI are the most common cloud-breach vector.
- **Alternatives:** Static IAM user keys (exfiltration risk, rotation toil); self-hosted runners with instance profiles (fleet to manage).
- **Trade-offs:** OIDC trust policy is slightly more setup and per-environment role scoping.
- **Consequence:** Each environment (`dev`/`staging`/`prod`) has a distinct deploy role with a trust condition on the repo + branch/environment; prod deploys additionally require a GitHub Environment approval.

---

## 4. Terraform layout

SQL-first, module-per-concern, one thin root stack per (environment × region) that instantiates shared modules. Remote state in S3 + DynamoDB lock, one state file per stack.

```text
infra/
  terraform/
    modules/                     # reusable, region-agnostic building blocks
      network/                   # VPC, subnets, NAT, route tables, endpoints, SGs
      ecs-cluster/               # cluster, capacity providers, exec logging
      ecs-service/               # generic Fargate service (task def, ALB TG, autoscale, SG)
      aurora/                    # Aurora Serverless v2 + pgvector param group + PITR
      elasticache/               # Redis cluster mode, multi-AZ, SGs
      alb/                       # ALB, listeners, ACM cert, WAF assoc
      s3-bucket/                 # encrypted bucket + lifecycle + policy
      cloudfront-api/            # CDN in front of api ALB (TLS, WAF, cache rules)
      secrets/                   # Secrets Manager entries + rotation lambdas
      observability/             # CW log groups, alarms, OTel collector task
      iam-github-oidc/           # OIDC provider + per-env deploy roles
    stacks/
      global/                    # Route53 zones, ACM (us-east-1 for CF), OIDC provider
      dev/us-east-1/             # single-region, small
      staging/us-east-1/
      prod/us-east-1/            # primary
      prod/eu-west-1/            # EU residency
    envs/
      dev.tfvars
      staging.tfvars
      prod.tfvars
```

### 4.1 State backend & workflow

```hcl
# stacks/prod/us-east-1/backend.tf
terraform {
  backend "s3" {
    bucket         = "cue-tfstate-prod"
    key            = "prod/us-east-1/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "cue-tflock"        # state locking
    encrypt        = true
    kms_key_id     = "alias/cue-tfstate"
  }
}
```

- **Plan on PR, apply on merge.** `terraform plan` runs in CI on every PR touching `infra/**` and posts the plan as a PR comment (via `tfcmt`). `apply` runs only after merge to `main`, gated by a GitHub Environment approval for `prod/*`.
- **`terraform fmt`, `validate`, `tflint`, and `checkov`** are required CI gates ([Engineering standards](13-engineering-standards.md)).
- Drift detection: a nightly `terraform plan` job alerts if live infra has drifted from state.

### 4.2 Example: a Fargate service module instantiation

```hcl
# stacks/prod/us-east-1/services.tf
module "ai_orchestrator" {
  source            = "../../../modules/ecs-service"
  name              = "ai-orchestrator"
  cluster_arn       = module.ecs.cluster_arn
  vpc_id            = module.network.vpc_id
  subnet_ids        = module.network.private_app_subnet_ids
  image             = "${var.ecr_repo}/ai-orchestrator@${var.ai_orchestrator_digest}"
  container_port    = 3002
  cpu               = 2048   # 2 vCPU
  memory            = 4096   # 4 GB
  desired_count     = 3
  min_count         = 3
  max_count         = 60
  health_check_path = "/healthz"
  autoscale = {
    target_cpu           = 60
    custom_metric        = "InFlightStreams"
    custom_metric_target = 40
  }
  secrets = [
    "ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "VOYAGE_API_KEY", "DATABASE_URL",
  ]
  environment = { NODE_ENV = "production", OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint }
}
```

---

## 5. Environments & promotion

| Env | Region(s) | Data | Purpose | Deploy trigger |
|---|---|---|---|---|
| **preview** | us-east-1 | Neon branch (ephemeral) | per-PR full-stack preview (web on Vercel Preview, services on a shared ephemeral cluster) | open PR |
| **dev** | us-east-1 | Aurora (small) | integration / manual QA | merge to `main` (auto) |
| **staging** | us-east-1 | Aurora (prod-shaped, synthetic data) | pre-prod smoke, load tests, release rehearsal | merge to `main` (auto) |
| **prod** | us-east-1 + eu-west-1 | Aurora multi-AZ | live | manual approval after staging green |

**Promotion is digest promotion.** CI builds one image per service, tags it with the git SHA, pushes to ECR. `dev` and `staging` deploy that digest automatically on merge. Prod deploys the *same digest* after a human approves the GitHub `production` Environment. Config differs only via `*.tfvars` and Secrets Manager — never a rebuild.

```mermaid
flowchart LR
  PR[PR opened] --> PREV[preview env<br/>Vercel + ephemeral cluster]
  PR --> CI[CI: lint · test · build image]
  CI -->|merge main| DEV[dev auto-deploy]
  DEV --> STG[staging auto-deploy<br/>smoke + load]
  STG -->|green| GATE{prod approval}
  GATE -->|approved| PROD1[prod us-east-1<br/>blue-green]
  PROD1 -->|health ok| PROD2[prod eu-west-1<br/>blue-green]
```

---

## 6. CI/CD — web & backend services

All pipelines are **GitHub Actions**, orchestrated with **Turborepo** remote caching so only affected packages build. Branching, required checks, and merge rules are owned by [Engineering standards](13-engineering-standards.md); this section covers deployment.

### 6.1 Web (Next.js → Vercel)

The marketing/app site ([Web landing](11-web-landing.md)) deploys through Vercel's native Git integration, not through our ECS pipeline.

- **Preview deployments** on every PR (unique URL, wired to a Neon DB branch + staging API).
- **Production** deploy on merge to `main`, promoted from the exact preview build (Vercel's "promote" — no rebuild).
- The download API route reads the release manifest from R2 (`latest.yml`/`latest-mac.yml`) — see §7.5 and [Web landing §download-flow](11-web-landing.md).
- Turbo cache + Vercel skip-build for unaffected changes keep marketing-only edits from redeploying services.

### 6.2 Backend services (build → test → image → ECS)

```mermaid
sequenceDiagram
  autonumber
  participant GH as GitHub Actions
  participant ECR as AWS ECR
  participant TF as ECS (Fargate)
  participant ALB as ALB
  GH->>GH: pnpm install (cached) · turbo test · turbo build
  GH->>GH: docker build (per affected service)
  GH->>ECR: push image:<sha> (OIDC role)
  GH->>TF: register new task def revision
  Note over TF,ALB: Blue-green via CodeDeploy
  TF->>ALB: shift 10% traffic to GREEN
  ALB-->>TF: canary healthy (5 min, alarms clear)
  TF->>ALB: shift 100% → GREEN
  TF->>TF: terminate BLUE (after bake)
```

- **Deploy strategy: blue-green via AWS CodeDeploy** for `api`, `entitlements`, `billing-webhooks` (clean cutover, instant rollback by traffic shift back to BLUE).
- **`ws-gateway` uses a canary/linear shift**, not hard blue-green, because it holds long-lived WebSocket connections: new tasks take new connections while old tasks drain existing streams up to a max lifetime (see [Scalability §connection-draining](70-scalability.md)). Deploys never kill a live meeting mid-stream.
- **`ai-orchestrator`** likewise drains in-flight streams before task termination (`stopTimeout` 120s, `SIGTERM` → finish current stream → exit).
- **Rollback:** CodeDeploy auto-rollback on a CloudWatch alarm breach (p99 latency, 5xx rate, health check failures) during the bake window. Manual rollback = redeploy previous digest (kept in ECR, immutable tags).
- **DB migrations (Drizzle Kit)** run as a one-off ECS task *before* the service deploy, gated to be backward-compatible (expand/contract pattern) so blue and green can run against the same schema. See [Data model §migrations](30-data-model.md).

---

## 7. Desktop release pipeline (electron-builder → signing → feed)

The desktop app ([Desktop app](10-desktop-app.md)) ships as signed, notarized installers with a self-hosted update feed consumed by `electron-updater`. This pipeline is triggered by a semver git tag (`desktop-v1.4.0`) and never by a normal merge.

```mermaid
flowchart TB
  TAG["git tag desktop-v*"] --> MTX{build matrix}
  MTX --> MAC["macos-14 runner<br/>build universal (arm64+x64)"]
  MTX --> WIN["windows-2022 runner<br/>build x64 (+arm64)"]

  MAC --> MSIGN["codesign (Developer ID App)<br/>hardened runtime + entitlements"]
  MSIGN --> NOTAR["notarytool submit --wait"]
  NOTAR --> STAPLE["stapler staple .dmg/.zip"]

  WIN --> WSIGN["sign .exe/.blockmap<br/>EV cert OR Azure Trusted Signing"]

  STAPLE --> PUB["electron-builder --publish<br/>upload artifacts + latest*.yml"]
  WSIGN --> PUB
  PUB --> R2["Cloudflare R2 (dl.cue.app)<br/>channel: alpha|beta|latest"]
  R2 --> ROLL["staged rollout<br/>stagingPercentage in yml"]
  ROLL --> UPD["electron-updater clients"]
```

### 7.1 Build matrix

`electron-builder` runs on native runners per OS (cross-signing macOS from Linux is not viable).

| Runner | Target | Arch | Output |
|---|---|---|---|
| `macos-14` (Apple silicon) | `dmg`, `zip` | universal (arm64 + x64) | `Cue-1.4.0-universal.dmg`, `Cue-1.4.0-universal-mac.zip` |
| `windows-2022` | `nsis` | x64 (arm64 in Phase 2) | `Cue Setup 1.4.0.exe` + `.blockmap` |

The `.zip` on macOS is required by `electron-updater` for delta updates; the `.dmg` is the human download. The `.blockmap` on Windows enables differential (delta) downloads so an update transfers only changed blocks.

### 7.2 macOS: sign → notarize → staple

```yaml
# .github/workflows/desktop-release.yml (macos job, abridged)
- name: Import Developer ID cert
  env:
    APPLE_CERT_P12: ${{ secrets.APPLE_DEVELOPER_ID_P12 }}   # base64
    APPLE_CERT_PASSWORD: ${{ secrets.APPLE_CERT_PASSWORD }}
  run: ./scripts/import-macos-cert.sh   # creates a temp keychain, imports, unlocks

- name: Build · sign · notarize · staple · publish
  env:
    CSC_LINK: ${{ runner.temp }}/cert.p12
    CSC_KEY_PASSWORD: ${{ secrets.APPLE_CERT_PASSWORD }}
    APPLE_API_KEY: ${{ secrets.APPLE_API_KEY_P8 }}          # App Store Connect API key (.p8)
    APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
    APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
  run: pnpm --filter desktop build:mac --publish always
```

- **Hardened Runtime** enabled with entitlements the app genuinely needs: `com.apple.security.device.audio-input` (mic), and the ScreenCaptureKit/Core Audio tap capabilities for system-audio capture ([Desktop app §audio-capture](10-desktop-app.md)). No `disable-library-validation` unless a native module forces it (it should not).
- **Notarization** via `notarytool` using an App Store Connect API key (not app-specific passwords). electron-builder submits and polls; the job fails if notarization is rejected.
- **Stapling** the ticket onto the `.dmg`/`.zip` so Gatekeeper passes offline. A build that is signed but not stapled is treated as a pipeline failure.

### 7.3 Windows: signing

Two accepted paths (ADR-INF-04):

| Option | How | Pros | Cons |
|---|---|---|---|
| **Azure Trusted Signing** (preferred) | Cloud HSM-backed cert, `AzureSignTool` invoked by electron-builder `signtoolOptions` | No physical token, keys never on runner, cheap, immediate MS SmartScreen reputation with EV-class cert | Azure tenant + RBAC setup |
| **OV/EV cert on cloud HSM** | `.pfx`/HSM via `signtool` | Familiar | EV token/HSM logistics; OV builds SmartScreen reputation slowly |

Both sign the `.exe` **and** the `.blockmap`. We default to **Azure Trusted Signing** to avoid token custody and get EV-tier SmartScreen trust from day one.

### 7.4 ADR-INF-04 — Azure Trusted Signing for Windows
- **Decision:** Windows binaries are signed via Azure Trusted Signing.
- **Context:** Physical EV USB tokens can't be used on ephemeral GitHub-hosted runners; SmartScreen reputation matters for consumer download conversion.
- **Alternatives:** Self-hosted runner + physical EV token (fleet + custody); OV cert (slow SmartScreen warm-up scares users).
- **Trade-offs:** Ties Windows signing to an Azure account.
- **Consequence:** Signing keys stay in Azure's HSM; CI holds only a scoped service-principal credential.

### 7.5 Publishing & the update feed

- electron-builder `--publish` uploads installers + `latest.yml` (Win) and `latest-mac.yml` (macOS) to R2 under a channel prefix: `dl.cue.app/{alpha,beta,latest}/`.
- `electron-updater` is configured with `provider: generic, url: https://dl.cue.app/latest` (channel selectable in-app for beta opt-in). The manifest contract (`latest*.yml` shape: version, path, sha512, size, releaseDate, and optional `stagingPercentage`) is typed in `packages/types` ([Repo structure](03-repository-structure.md)) and consumed by the web download route ([Web landing](11-web-landing.md)).
- **Provenance:** every published `latest*.yml` carries the artifact `sha512`; `electron-updater` verifies it and the code signature before applying — a tampered R2 object cannot be installed.

### 7.6 Staged rollout

We ship gradually to catch regressions before 100% of users update:

- `latest*.yml` includes `stagingPercentage` (e.g. 10 → 25 → 50 → 100). `electron-updater` deterministically hashes the machine GUID to decide inclusion, so a given machine's cohort is stable across checks.
- Progression is manual/observed: hold at 10% for ~24h, watch [Sentry crash-free sessions + update-failure metrics](61-observability.md), then bump. A regression = set `stagingPercentage` back / re-publish the previous version as `latest` (rollback is a manifest edit + prior artifacts already on R2).
- Channels: internal builds → `alpha`, opt-in testers → `beta`, GA → `latest`.

---

## 8. Secrets management

| Where | Contents | Rotation |
|---|---|---|
| **AWS Secrets Manager** (per region) | `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `VOYAGE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, JWT signing keys, Clerk/WorkOS secrets | automatic rotation (Lambda) for DB creds; provider keys rotated quarterly via runbook |
| **GitHub Actions secrets / OIDC** | signing certs (`APPLE_DEVELOPER_ID_P12`, `APPLE_API_KEY_P8`, Azure signing SP), Vercel token, Turbo cache token. **No AWS static keys** (OIDC). | on personnel change + annually |
| **Vercel env** | web-side public + a few server-only (Stripe publishable, API base URL) | with GitHub |
| **Desktop client** | *no shared secrets*. Uses OAuth PKCE (public client); user tokens live in the OS keychain (Electron `safeStorage`/keytar) — never in the bundle. See [Auth](40-authentication.md). |

- ECS tasks receive secrets via the task definition `secrets` block (Secrets Manager ARN → env var), decrypted at container start with the task role's `kms:Decrypt` — secrets never sit in Terraform state as plaintext (only ARNs) and never in the image.
- KMS CMKs per environment; separate key for tfstate, backups, and app secrets.

---

## 9. Backups & disaster recovery

### 9.1 Backup matrix

| Asset | Mechanism | Frequency | Retention |
|---|---|---|---|
| Aurora Postgres | Automated snapshots + **PITR (continuous)** | continuous WAL, snapshot daily | 35 days PITR; monthly snapshot copied cross-region 1yr |
| Aurora (logical) | `pg_dump` to S3 (schema + critical tables) | nightly | 30 days |
| User uploads (S3) | Versioning + cross-region replication (CRR) us↔eu | continuous | versioned 90 days |
| Installers + feed (R2) | Immutable per-version objects; never overwritten | per release | indefinite (small) |
| Redis | Not authoritative — rebuildable. Daily snapshot for sessions/queues convenience only | daily | 3 days |
| Secrets | Secrets Manager built-in versioning + IaC | on change | 10 versions |
| Terraform state | S3 versioning + KMS | on apply | indefinite |

Redis is explicitly **not** a source of truth; entitlement/session state can be rehydrated from Postgres + Stripe ([Entitlements](50-subscriptions-entitlements.md)), so a Redis loss is a cache-warm event, not data loss.

### 9.2 DR targets & strategy

| Scenario | Strategy | RPO | RTO |
|---|---|---|---|
| Single AZ failure | Multi-AZ Aurora + Fargate spread auto-recover | ~0 | < 5 min (automatic) |
| Full region loss (us-east-1) | Promote eu-west-1 / restore from cross-region snapshot; Route53 failover | ≤ 5 min (cross-region snapshot lag) | ≤ 60 min (prod SLA) |
| Accidental data deletion | Aurora PITR to timestamp | ≤ 5 min | < 30 min |
| Bad deploy | Blue-green rollback / redeploy prior digest | 0 | < 10 min |
| Bad desktop release | Revert `stagingPercentage` / re-publish prior version | 0 | < 15 min |

- **us-east-1 is active; eu-west-1 serves EU-resident traffic and doubles as the primary DR target.** For non-EU data we run a warm-standby posture in eu-west-1: infra is Terraform-defined and can be stood up / scaled from baseline, Aurora restored from the latest cross-region snapshot. This is warm standby (RTO ≤ 60 min), not active-active — active-active is a Phase 3 decision tracked in [Scalability §multi-region](70-scalability.md).
- Route53 health checks + failover routing flip the `api.cue.app` record to the surviving region.
- **DR is rehearsed quarterly** (game day): restore Aurora into an isolated stack, point a staging clone at it, validate. An untested backup is not a backup.
- **The 99.9% uptime NFR** ([targets](02-system-architecture.md)) drives the ≤ 60 min prod RTO — that budget is tracked as an error budget in [Observability §slos](61-observability.md).

---

## 10. Cost & FinOps hooks

- **Tagging standard** enforced by Terraform: every resource carries `Environment`, `Service`, `CostCenter`, `Region`. AWS Cost Explorer + budgets alert per service.
- The largest controllable lines are **LLM/STT vendor spend** (not AWS — owned by [AI pipeline §cost-controls](21-ai-pipeline.md) and [Unit economics](71-unit-economics.md)) and **Fargate for `ai-orchestrator`**. Aurora v2 min-ACU and NAT egress are watched; R2 keeps installer egress at ~$0.
- Fargate Spot for `dev`/`staging` non-critical tasks; on-demand for prod latency-critical services.

---

## Open questions & risks

1. **Active-active vs warm-standby for non-EU DR.** Warm standby meets 60 min RTO but a stricter enterprise SLA (or a big region outage during peak) may force active-active — that roughly doubles data-tier cost and adds cross-region write-conflict complexity. Decision deferred to [Scalability](70-scalability.md); revisit at first enterprise SLA commitment.
2. **Aurora v2 cold-start / min-ACU floor.** At low traffic the min ACU is a fixed cost; at spike, 15s scaling steps may lag a sudden meeting surge. Need load-test evidence (staging) that pre-warm/min-ACU is tuned so DB scaling never becomes the latency bottleneck.
3. **macOS entitlements & notarization fragility.** ScreenCaptureKit/Core Audio-tap entitlements plus content-protection APIs are exactly the surface Apple scrutinizes; a notarization policy change could block a release. Mitigation: keep entitlements minimal and documented, and monitor Apple developer release notes; a rejected notarization is a release-blocking P1.
4. **Two clouds (AWS + Cloudflare R2) + Vercel + Azure signing.** Four control planes to secure and IaC. Justified by economics/DX, but raises the audit and secret-sprawl surface — consolidate into Terraform providers and document in the SOC 2 scope.
5. **Windows arm64.** Deferred to Phase 2; verify WASAPI loopback + `SetWindowDisplayAffinity` parity on arm64 before committing a matrix target.
6. **DB migration safety under blue-green.** Expand/contract discipline is a human process; a non-backward-compatible migration slipping through would break the BLUE fleet mid-deploy. Enforce with a CI migration-linter check ([Engineering standards](13-engineering-standards.md)).
