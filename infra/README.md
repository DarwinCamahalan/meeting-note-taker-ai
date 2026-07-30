# Cue — Infrastructure (Terraform)

Phase 4 IaC for **Cue** on AWS: ECS Fargate + ALB, Aurora Serverless v2
(Postgres 16 + pgvector), ElastiCache Redis (split control / session), CloudFront
+ Route53 + ACM, Secrets Manager, and S3/R2 object storage. Everything here is
`terraform validate`-clean and `terraform fmt`-clean.

Design references: [`docs/60-devops-infrastructure.md`](../docs/60-devops-infrastructure.md),
[`docs/70-scalability.md`](../docs/70-scalability.md),
[`docs/02-system-architecture.md`](../docs/02-system-architecture.md),
[`docs/05-remediation-plan.md`](../docs/05-remediation-plan.md).

> **No secrets, account ids, or state backends are hardcoded.** Secret *values*
> are written to Secrets Manager out-of-band (only ARNs flow through Terraform);
> the ElastiCache AUTH token is injected via `TF_VAR_redis_auth_token`; the S3 +
> DynamoDB state backend is supplied at `init` via `-backend-config` (below).

---

## 1. Layout

```
infra/
  versions.tf          # terraform + AWS provider version floors
  providers.tf         # aws (primary) + aws.eu (secondary) + aws.global (us-east-1 for CF ACM)
  backend.tf           # S3 + DynamoDB-lock PLACEHOLDER (values via -backend-config)
  variables.tf         # root inputs (strongly typed; no secret values)
  locals.tf            # naming + mandatory FinOps tag set
  main.tf              # PRIMARY region composition + global edge + KMS + origin DNS
  secondary-region.tf  # SECONDARY region (eu-west-1), gated by enable_secondary_region
  outputs.tf           # endpoints/handles CI + operators consume
  envs/
    dev.tfvars         # single region, HTTP-only, smallest footprint
    staging.tfvars     # single region, prod-shaped, CloudFront on
    prod.tfvars        # TWO regions, prod sizing, CloudFront on, R2 release store
  modules/
    network/           # VPC, 3-tier subnets, NAT, route tables, VPC endpoints, SGs
    data/              # Aurora Serverless v2 (+pgvector param) + 2× ElastiCache Redis
    compute/           # ECS cluster, ALBs (public + internal gRPC), task defs, services, autoscaling, IAM
    edge/              # Route53 + ACM (CloudFront cert) + CloudFront distribution
    secrets/           # Secrets Manager entries (names only; values out-of-band)
    storage/           # S3 uploads + backups (+ optional S3/R2 release artifacts)
```

One **root stack**, selected per environment with `-var-file`. This is the DRY
form of doc 60 §4's per-`(env × region)` stacks: the same modules are
instantiated for the primary region in `main.tf` and, when
`enable_secondary_region = true`, again for `eu-west-1` in `secondary-region.tf`.

---

## 2. The two-region model (us-east-1 + eu-west-1)

Per [doc 70 §4](../docs/70-scalability.md) and [doc 60 §1](../docs/60-devops-infrastructure.md):

- **`us-east-1` is primary; `eu-west-1` serves EU-resident data + is the DR target.**
  Regions are **symmetric module instantiations**, not bespoke stacks — the
  `network`/`data`/`compute`/`secrets`/`storage` modules are called once per
  region under a distinct provider (`aws` vs `aws.eu`).
- **Region pinning is the residency guarantee.** A user's Aurora/Redis/S3/secrets
  live only in their home region; **no user PII replicates across regions**. Each
  region has its own KMS CMK.
- **Regional admission control** ([ADR-70.3](../docs/70-scalability.md)): the
  Anthropic/STT keys are the *same secret names* with *distinct values* per region
  (`cue-us` vs `cue-eu` orgs), so one region's peak can't drain the other's quota.
- **The global edge is created once.** Route53, the CloudFront distribution, and
  the CloudFront ACM cert (which AWS requires in `us-east-1`, hence the
  `aws.global` provider alias) are shared. `origin.api.<domain>` is a Route53
  **failover** record: PRIMARY → us-east-1 ALB, SECONDARY → eu-west-1 ALB
  (doc 60 §9.2). CloudFront fronts that stable hostname.
- **Cross-module graph is acyclic:** `edge` never references a `compute` output;
  the `origin → ALB` alias is created at the root, so `edge → compute` is the only
  direction (regional ALB cert → compute HTTPS listener).

`enable_secondary_region` defaults **off** for dev/staging (single region) and
**on** for prod.

---

## 3. One-time bootstrap (the only manual step)

The state backend must exist before the first `init` (doc 60 §1, §4.1). Create it
once per account, out-of-band:

```bash
# S3 state bucket (versioned, KMS-encrypted) + DynamoDB lock table.
aws s3api create-bucket --bucket cue-tfstate-prod --region us-east-1
aws s3api put-bucket-versioning --bucket cue-tfstate-prod \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name cue-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region us-east-1
```

Use a separate bucket/prefix per environment. Nothing else is created by hand.

---

## 4. Apply order

```bash
cd infra

# 4a. Init, wiring the backend for THIS env/region (backend.tf is a placeholder).
terraform init \
  -backend-config="bucket=cue-tfstate-prod" \
  -backend-config="key=prod/us-east-1/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=cue-tflock" \
  -backend-config="encrypt=true"

# 4b. Provide the ElastiCache AUTH token out-of-band (never in a committed file).
export TF_VAR_redis_auth_token="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-40)"

# 4c. Plan + apply the environment.
terraform plan  -var-file=envs/prod.tfvars -out=plan.bin
terraform apply plan.bin
```

**Resource dependency order is resolved automatically by Terraform**, but the
logical sequence is:

1. `KMS CMK` (per region) — encrypts everything below.
2. `edge` (global) — Route53 zone + CloudFront ACM cert. *(edge-enabled envs)*
3. Regional ALB ACM cert — DNS-validated against the edge zone.
4. `network` → `secrets` → `storage` → `data` (per region).
5. `compute` — needs network SGs/subnets, the secret ARNs, and the ALB cert.
6. Root `origin`/`failover` Route53 records — need both edge + compute.

**After the first apply**, populate the Secrets Manager values (they are created
empty). ECS tasks read them by ARN at container start:

```bash
aws secretsmanager put-secret-value \
  --secret-id cue-prod-us-east-1/ANTHROPIC_API_KEY --secret-string 'sk-ant-...'
# repeat per secret, per region (cue-prod-us-east-1/*, cue-prod-eu-west-1/*)
```

---

## 5. Environments

| Env | Regions | NAT | Aurora ACU | CloudFront | Notes |
|---|---|---|---|---|---|
| `dev` | us-east-1 | 1 shared | 0.5–4 | off | HTTP-only, buckets `force_destroy`, ECS Exec on |
| `staging` | us-east-1 | 1 shared | 0.5–16 | on | prod-shaped, `staging.cue.app` |
| `prod` | us-east-1 **+ eu-west-1** | per-AZ | 2–32 | on | 3 AZ, Multi-AZ Redis, `cue.app`, R2 release store, deletion protection |

Image promotion is **digest promotion** (doc 60 §5): CI builds one image per
service, and `deploy.yml` passes the promoted git SHA as `-var image_tag=<sha>`.

---

## 6. What each module provisions

- **network** — `/16` VPC; public / private-app / private-data subnets across
  `az_count` AZs (doc 60 §2.1); NAT (shared or per-AZ); S3 gateway endpoint +
  interface endpoints (Secrets Manager, ECR ×2, Logs, KMS); the SG chain
  `internet→alb→app→data` (data tier has **no** egress).
- **data** — Aurora Serverless v2 PG16 (writer + read replica for RAG reads,
  doc 70 §2.4), storage KMS-encrypted, RDS-managed master password, `rds.force_ssl`,
  35-day PITR; **two** ElastiCache Redis replication groups — `control` and
  `session` (doc 70 §2.6 / ADR-70.2) — both with **in-transit + at-rest
  encryption + AUTH** (RM-ENC) and Multi-AZ auto-failover.
- **compute** — ECS cluster (Fargate + Spot, Container Insights, Service Connect
  for internal TLS); a **public ALB** (api default + ws-gateway host rule; 300s
  idle for long-lived WS) and an **internal ALB** for ai-orchestrator gRPC; a
  target group + task def + service + autoscaling per service; per-service task
  roles scoped to only that service's secret ARNs (least privilege, doc 60 §1);
  `stopTimeout` SIGTERM drain (doc 60 §6.2); deployment circuit breaker + rollback.
- **edge** — Route53 (create or look up), CloudFront ACM cert (us-east-1),
  CloudFront distribution (`CachingDisabled` — API is dynamic), and the public
  `api.<domain>` alias.
- **secrets** — one Secrets Manager entry per logical name, per region; **values
  managed out-of-band** (`ignore_changes`), so plaintext never enters state.
- **storage** — KMS-encrypted, public-access-blocked, TLS-only S3 buckets for
  uploads (versioned + lifecycle) and DB backups; an optional S3 release bucket,
  or the documented Cloudflare R2 path (ADR-INF-02) when `release_store = "r2"`.

---

## 7. Autoscaling (doc 70 §7)

Every service has CPU target-tracking; the api tier also scales on
`ALBRequestCountPerTarget`. `ws-gateway` (active connections) and
`ai-orchestrator` (in-flight streams) scale on **custom CloudWatch metrics**
emitted by `@cue/observability` — the target-tracking policy is present but
commented in `modules/compute/autoscaling.tf` until those metrics publish.
Scale-out is aggressive (60s cooldown); scale-in is conservative (300s+) because
long-lived connections make premature scale-in disruptive.

---

## 8. Verify locally

```bash
terraform fmt -recursive -check
terraform init -backend=false && terraform validate
```

Both pass clean in this tree. In CI, `plan` runs on every PR touching `infra/**`
and posts the plan as a comment; `apply` runs on merge, gated by a GitHub
`production` Environment approval for prod (doc 60 §4.1). `tflint` + `checkov`
are additional required gates.

---

## 9. Known skeleton caveats (wire before first prod apply)

- **gRPC over the internal ALB requires TLS.** A gRPC target group needs an
  HTTPS/HTTP2 listener; the dev fallback (`HTTP:8443`) exists only so single-region
  dev plans; in real deployments ai-orchestrator is reached via **Service Connect**
  (already enabled) or the internal ALB with the regional cert.
- **Container images must be ARM64** (`runtime_platform = ARM64`, Graviton) — build
  multi-arch or arm64 images in `deploy.yml`, or flip to `X86_64`.
- **S3 cross-region replication** (`enable_cross_region_replication`) is declared
  but the replication rule is left to wire once both regions and their KMS
  replica-key grants exist (doc 60 §9.1).
- **PgBouncer** (doc 70 §2.5) is an application/sidecar concern, not provisioned here.
