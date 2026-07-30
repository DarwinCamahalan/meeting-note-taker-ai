# ElastiCache Redis — TWO clusters per region (doc 70 §2.6 / ADR-70.2):
#   control        — Claude RPM/TPM token bucket, STT lease + rate-limit counters
#                    (low volume, hot path on every cue, must fail over fast)
#   session/stream — session state, presence, WS offsets, BullMQ queues
#                    (higher churn, latency-tolerant, scales first)
#
# RM-ENC: both clusters require encryption in transit + at rest + AUTH.

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.name_prefix}-redis"
  subnet_ids = var.data_subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-redis-subnets" })
}

resource "aws_elasticache_parameter_group" "redis" {
  name        = "${var.name_prefix}-redis"
  family      = "redis7"
  description = "Cue Redis 7 params (cluster mode)."
  tags        = var.tags
}

locals {
  redis_clusters = {
    control = {
      shards      = var.redis_control_shards
      description = "Cue control Redis: token bucket + counters (hot path)."
    }
    session = {
      shards      = var.redis_session_shards
      description = "Cue session/stream Redis: sessions, offsets, BullMQ."
    }
  }
}

resource "aws_elasticache_replication_group" "redis" {
  for_each = local.redis_clusters

  replication_group_id = "${var.name_prefix}-${each.key}"
  description          = each.value.description
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  port                 = 6379

  # Cluster mode: N shards, each with replicas for Multi-AZ auto-failover.
  num_node_groups            = each.value.shards
  replicas_per_node_group    = var.redis_replicas_per_shard
  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [var.data_security_group_id]
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  # RM-ENC: in-transit + at-rest encryption + AUTH.
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  auth_token                 = var.redis_auth_token != "" ? var.redis_auth_token : null
  auth_token_update_strategy = "ROTATE"

  snapshot_retention_limit = 3 # convenience only; Redis is not authoritative (doc 60 §9.1)
  snapshot_window          = "05:00-06:00"
  apply_immediately        = false

  tags = merge(var.tags, { Name = "${var.name_prefix}-${each.key}", RedisRole = each.key })

  lifecycle {
    ignore_changes = [engine_version]
  }
}
