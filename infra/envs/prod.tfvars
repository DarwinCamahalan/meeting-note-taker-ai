# prod — TWO regions (us-east-1 primary + eu-west-1 EU residency / DR).
# Apply: terraform apply -var-file=envs/prod.tfvars   (redis_auth_token via TF_VAR_)
# Prod deploys are gated by a GitHub `production` Environment approval (doc 60 §5).

environment             = "prod"
primary_region          = "us-east-1"
secondary_region        = "eu-west-1"
enable_secondary_region = true

# Networking — 3 AZ in prod us-east-1 (doc 60 §2.1); NAT per AZ (HA).
vpc_cidr_primary   = "10.0.0.0/16"
vpc_cidr_secondary = "10.1.0.0/16"
az_count           = 3
single_nat_gateway = false

# Data — doc 60 §2.3 prod ACU 2–32; one read replica per region; Multi-AZ Redis.
aurora_min_acu               = 2
aurora_max_acu               = 32
aurora_backup_retention_days = 35
redis_node_type              = "cache.r7g.large"
redis_control_shards         = 1
redis_session_shards         = 2

# Edge — production domain, CloudFront on, Route53 zone already delegated.
domain_name         = "cue.app"
api_subdomain       = "api"
manage_route53_zone = false
enable_cloudfront   = true

uploads_versioning              = true
enable_cross_region_replication = true
release_store                   = "r2"

image_tag          = "latest" # overridden by deploy.yml with the promoted git SHA
log_retention_days = 90

# Fargate services — doc 60 §2.2 prod baseline sizing + doc 70 §7 min/max.
services = {
  api = {
    container_port    = 3001
    cpu               = 512
    memory            = 1024
    desired_count     = 3
    min_count         = 3
    max_count         = 40
    health_check_path = "/healthz"
    alb               = "public"
    protocol_version  = "HTTP1"
    host_header       = ""
    target_cpu        = 65
    stop_timeout      = 30
    secret_keys       = ["DATABASE_URL", "REDIS_CONTROL_URL", "REDIS_SESSION_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "SENTRY_DSN", "POSTHOG_KEY"]
    environment       = { NODE_ENV = "production", METRICS_PORT = "9464" }
  }
  ws-gateway = {
    container_port    = 3002
    cpu               = 1024
    memory            = 2048
    desired_count     = 3
    min_count         = 3
    max_count         = 40
    health_check_path = "/healthz"
    alb               = "public"
    protocol_version  = "HTTP1"
    host_header       = "ws.*"
    target_cpu        = 60
    stop_timeout      = 90
    secret_keys       = ["REDIS_CONTROL_URL", "REDIS_SESSION_URL", "SENTRY_DSN"]
    environment       = { NODE_ENV = "production", METRICS_PORT = "9464" }
  }
  ai-orchestrator = {
    container_port    = 50051
    cpu               = 2048
    memory            = 4096
    desired_count     = 3
    min_count         = 3
    max_count         = 60
    health_check_path = "/grpc.health.v1.Health/Check"
    alb               = "internal"
    protocol_version  = "GRPC"
    host_header       = ""
    target_cpu        = 70
    stop_timeout      = 120
    secret_keys       = ["DATABASE_URL", "REDIS_CONTROL_URL", "REDIS_SESSION_URL", "ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "ASSEMBLYAI_API_KEY", "VOYAGE_API_KEY", "SENTRY_DSN"]
    environment       = { NODE_ENV = "production", METRICS_PORT = "9464" }
  }
}
