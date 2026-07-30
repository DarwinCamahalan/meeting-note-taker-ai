# dev — single region (us-east-1), smallest footprint, cost-optimized.
# Apply: terraform apply -var-file=envs/dev.tfvars   (redis_auth_token via TF_VAR_)

environment             = "dev"
primary_region          = "us-east-1"
enable_secondary_region = false

# Networking — 2 AZ, one shared NAT (cheapest).
vpc_cidr_primary   = "10.0.0.0/16"
az_count           = 2
single_nat_gateway = true

# Data — Aurora scales to the floor; single Redis shard each; no replica.
aurora_min_acu               = 0.5
aurora_max_acu               = 4
aurora_backup_retention_days = 7
redis_node_type              = "cache.t4g.micro"
redis_control_shards         = 1
redis_session_shards         = 1

# Edge — off in dev (no public domain; services reached via ALB DNS / port-fwd).
domain_name       = ""
enable_cloudfront = false

# Storage — allow teardown of non-empty buckets in dev.
uploads_versioning = false
release_store      = "s3"

image_tag          = "latest"
log_retention_days = 14

# Fargate services (doc 60 §2.2 shape, dev-sized: min counts, small tasks).
services = {
  api = {
    container_port    = 3001
    cpu               = 256
    memory            = 512
    desired_count     = 1
    min_count         = 1
    max_count         = 3
    health_check_path = "/healthz"
    alb               = "public"
    protocol_version  = "HTTP1"
    host_header       = ""
    target_cpu        = 65
    stop_timeout      = 30
    secret_keys       = ["DATABASE_URL", "REDIS_CONTROL_URL", "REDIS_SESSION_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "SENTRY_DSN", "POSTHOG_KEY"]
    environment       = { NODE_ENV = "development", METRICS_PORT = "9464" }
  }
  ws-gateway = {
    container_port    = 3002
    cpu               = 256
    memory            = 512
    desired_count     = 1
    min_count         = 1
    max_count         = 3
    health_check_path = "/healthz"
    alb               = "public"
    protocol_version  = "HTTP1"
    host_header       = "ws.*"
    target_cpu        = 60
    stop_timeout      = 60
    secret_keys       = ["REDIS_CONTROL_URL", "REDIS_SESSION_URL", "SENTRY_DSN"]
    environment       = { NODE_ENV = "development", METRICS_PORT = "9464" }
  }
  ai-orchestrator = {
    container_port    = 50051
    cpu               = 512
    memory            = 1024
    desired_count     = 1
    min_count         = 1
    max_count         = 3
    health_check_path = "/grpc.health.v1.Health/Check"
    alb               = "internal"
    protocol_version  = "GRPC"
    host_header       = ""
    target_cpu        = 70
    stop_timeout      = 120
    secret_keys       = ["DATABASE_URL", "REDIS_CONTROL_URL", "REDIS_SESSION_URL", "ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "ASSEMBLYAI_API_KEY", "VOYAGE_API_KEY", "SENTRY_DSN"]
    environment       = { NODE_ENV = "development", METRICS_PORT = "9464" }
  }
}
