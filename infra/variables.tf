# Cue — root stack input variables. Values are supplied per environment from
# envs/<env>.tfvars (see README). No secret VALUES ever live here — only their
# names/ARNs flow through; the actual secret material is written into Secrets
# Manager out-of-band (doc 60 §8) or injected via TF_VAR_* at apply time.

# ---- Identity / tagging ----------------------------------------------------

variable "project" {
  description = "Project slug used to name + tag every resource."
  type        = string
  default     = "cue"
}

variable "environment" {
  description = "Deployment environment: dev | staging | prod."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "cost_center" {
  description = "FinOps cost-center tag applied to all resources (doc 60 §10)."
  type        = string
  default     = "platform"
}

variable "extra_tags" {
  description = "Additional tags merged onto the mandatory tag set."
  type        = map(string)
  default     = {}
}

# ---- Regions ---------------------------------------------------------------

variable "primary_region" {
  description = "Primary AWS region (doc 70 §4: us-east-1 primary)."
  type        = string
  default     = "us-east-1"
}

variable "secondary_region" {
  description = "Secondary AWS region (doc 70 §4: eu-west-1 EU residency / DR)."
  type        = string
  default     = "eu-west-1"
}

variable "enable_secondary_region" {
  description = <<-EOT
    Toggle for the eu-west-1 stack. Regions are symmetric module instantiations
    (doc 60 §1). When true, network/data/compute/secrets/storage are stood up a
    second time under the aws.eu provider. Global edge (Route53/CloudFront/ACM)
    is created ONCE regardless. dev/staging default to false; prod = true.
  EOT
  type        = bool
  default     = false
}

# ---- Networking ------------------------------------------------------------

variable "vpc_cidr_primary" {
  description = "VPC CIDR for the primary region (doc 60 §2.1: 10.0.0.0/16)."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_cidr_secondary" {
  description = "VPC CIDR for the secondary region (doc 60 §2.1: 10.1.0.0/16)."
  type        = string
  default     = "10.1.0.0/16"
}

variable "az_count" {
  description = "AZs per region. 2 minimum; 3 in prod us-east-1 (doc 60 §2.1)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = "Cost lever: one shared NAT GW (dev/staging) vs one per AZ (prod)."
  type        = bool
  default     = true
}

# ---- Data tier -------------------------------------------------------------

variable "aurora_min_acu" {
  description = "Aurora Serverless v2 min ACU (doc 60 §2.3: 0.5 staging / 2 prod)."
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Aurora Serverless v2 max ACU (doc 60 §2.3: 16 staging / 32 prod)."
  type        = number
  default     = 16
}

variable "aurora_backup_retention_days" {
  description = "Aurora automated-backup / PITR window in days (doc 60 §9.1: 35)."
  type        = number
  default     = 35
}

variable "redis_node_type" {
  description = "ElastiCache node type for both Redis clusters (doc 70 §2.6)."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_control_shards" {
  description = "Control Redis (token bucket/counters) shard count (doc 70 §2.6)."
  type        = number
  default     = 1
}

variable "redis_session_shards" {
  description = "Session/stream Redis shard count; scales first (doc 70 §3.7)."
  type        = number
  default     = 1
}

variable "redis_auth_token" {
  description = <<-EOT
    ElastiCache AUTH token (RM-ENC: in-transit + at-rest + AUTH required).
    Supplied via TF_VAR_redis_auth_token or a *.tfvars kept OUT of git — never a
    default here. 16–128 printable chars. Empty string only for `plan` scaffolding.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

# ---- Compute / services ----------------------------------------------------

variable "services" {
  description = <<-EOT
    Per-service Fargate configuration (doc 60 §2.2, doc 70 §7). Keyed by the
    canonical service name. `alb` routes the target group to the public ALB
    (api/ws-gateway) or the internal ALB (ai-orchestrator gRPC).
  EOT
  type = map(object({
    container_port    = number
    cpu               = number # Fargate CPU units (1024 = 1 vCPU)
    memory            = number # MiB
    desired_count     = number
    min_count         = number
    max_count         = number
    health_check_path = string
    alb               = string # "public" | "internal"
    protocol_version  = string # "HTTP1" | "HTTP2" | "GRPC"
    host_header       = string # host-based ALB routing ("" = default rule)
    target_cpu        = number # target-tracking CPU % (doc 70 §7)
    stop_timeout      = number # SIGTERM drain seconds (doc 60 §6.2)
    secret_keys       = list(string)
    environment       = map(string)
  }))
}

variable "image_tag" {
  description = "Immutable image tag (git SHA) promoted across envs (doc 60 §5)."
  type        = string
  default     = "latest"
}

variable "ecr_registry" {
  description = "ECR registry host, e.g. <acct>.dkr.ecr.<region>.amazonaws.com. Empty = derive from caller identity."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for ECS task logs."
  type        = number
  default     = 30
}

# ---- Secrets ---------------------------------------------------------------

variable "secret_names" {
  description = <<-EOT
    Secrets Manager entries provisioned per region (doc 60 §8). Only the NAMES
    are declared in IaC; values are written out-of-band so plaintext never lands
    in state. Regional admission control (doc 70 §4.4 / ADR-70.3) means the
    Anthropic/STT keys differ per region — same names, distinct values.
  EOT
  type        = list(string)
  default = [
    "DATABASE_URL",
    "REDIS_CONTROL_URL",
    "REDIS_SESSION_URL",
    "ANTHROPIC_API_KEY",
    "DEEPGRAM_API_KEY",
    "ASSEMBLYAI_API_KEY",
    "VOYAGE_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "WORKOS_API_KEY",
    "WORKOS_WEBHOOK_SECRET",
    "SENTRY_DSN",
    "POSTHOG_KEY",
  ]
}

# ---- Edge ------------------------------------------------------------------

variable "domain_name" {
  description = "Apex domain, e.g. cue.app. Empty disables edge (Route53/CF/ACM)."
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "API hostname served by CloudFront -> ALB (doc 60 §2)."
  type        = string
  default     = "api"
}

variable "manage_route53_zone" {
  description = "true = create the hosted zone; false = look it up (already delegated)."
  type        = bool
  default     = false
}

variable "enable_cloudfront" {
  description = "Front the api ALB with CloudFront (doc 60 §2 edge)."
  type        = bool
  default     = true
}

# ---- Storage ---------------------------------------------------------------

variable "uploads_versioning" {
  description = "S3 versioning on the user-uploads bucket (doc 60 §9.1)."
  type        = bool
  default     = true
}

variable "enable_cross_region_replication" {
  description = "S3 CRR us<->eu for user uploads (doc 60 §9.1). Needs both regions."
  type        = bool
  default     = false
}

variable "release_store" {
  description = <<-EOT
    Where signed installers + latest*.yml live (ADR-INF-02). "s3" keeps them in
    AWS; "r2" documents the Cloudflare R2 zero-egress path (requires the
    cloudflare provider, left commented in versions.tf).
  EOT
  type        = string
  default     = "s3"

  validation {
    condition     = contains(["s3", "r2"], var.release_store)
    error_message = "release_store must be s3 or r2."
  }
}
