# staging — single region (us-east-1), prod-shaped with synthetic data.
# Apply: terraform apply -var-file=envs/staging.tfvars   (redis_auth_token via TF_VAR_)

environment             = "staging"
primary_region          = "us-east-1"
enable_secondary_region = false

# Networking — 2 AZ, one shared NAT.
vpc_cidr_primary   = "10.0.0.0/16"
az_count           = 2
single_nat_gateway = true

# Data — doc 60 §2.3 staging ACU range; one read replica; single shards.
aurora_min_acu               = 0.5
aurora_max_acu               = 16
aurora_backup_retention_days = 14
redis_node_type              = "cache.t4g.small"
redis_control_shards         = 1
redis_session_shards         = 1

# Edge — enabled on the staging subdomain; hosted zone already delegated.
domain_name         = "staging.cue.app"
api_subdomain       = "api"
manage_route53_zone = false
enable_cloudfront   = true

uploads_versioning = true
release_store      = "s3"

image_tag          = "latest"
log_retention_days = 30

services = {
  api = {
    container_port    = 3001
    cpu               = 512
    memory            = 1024
    desired_count     = 2
    min_count         = 2
    max_count         = 10
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
    desired_count     = 2
    min_count         = 2
    max_count         = 20
    health_check_path = "/healthz"
    alb               = "public"
    protocol_version  = "HTTP1"
    host_header       = "ws.*"
    target_cpu        = 60
    stop_timeout      = 60
    secret_keys       = ["REDIS_CONTROL_URL", "REDIS_SESSION_URL", "SENTRY_DSN"]
    environment       = { NODE_ENV = "production", METRICS_PORT = "9464" }
  }
  ai-orchestrator = {
    container_port    = 50051
    cpu               = 1024
    memory            = 2048
    desired_count     = 2
    min_count         = 2
    max_count         = 20
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
