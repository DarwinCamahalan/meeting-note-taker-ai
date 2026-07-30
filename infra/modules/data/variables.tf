variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "vpc_id" {
  description = "VPC id the data tier lives in."
  type        = string
}

variable "data_subnet_ids" {
  description = "Private data subnet ids (no egress)."
  type        = list(string)
}

variable "data_security_group_id" {
  description = "Security group allowing app-tier -> 5432/6379."
  type        = string
}

variable "kms_key_arn" {
  description = "KMS CMK arn for at-rest encryption (Aurora storage + Redis)."
  type        = string
}

# ---- Aurora ----------------------------------------------------------------

variable "postgres_engine_version" {
  description = "Aurora PostgreSQL engine version (16.x, pgvector-capable)."
  type        = string
  default     = "16.4"
}

variable "aurora_min_acu" {
  description = "Serverless v2 minimum ACU."
  type        = number
}

variable "aurora_max_acu" {
  description = "Serverless v2 maximum ACU."
  type        = number
}

variable "aurora_replica_count" {
  description = "Read replicas for RAG/read-heavy load (doc 70 §2.4). 0 = writer only."
  type        = number
  default     = 1
}

variable "aurora_backup_retention_days" {
  description = "Automated backup / PITR window in days (doc 60 §9.1)."
  type        = number
  default     = 35
}

variable "database_name" {
  description = "Initial database name."
  type        = string
  default     = "cue"
}

variable "master_username" {
  description = "Aurora master username. Password is KMS-managed (manage_master_user_password)."
  type        = string
  default     = "cue_admin"
}

variable "deletion_protection" {
  description = "Block accidental cluster deletion (true in prod)."
  type        = bool
  default     = false
}

# ---- Redis (doc 70 §2.6: control + session/stream, split) ------------------

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.1"
}

variable "redis_node_type" {
  description = "ElastiCache node type for both clusters."
  type        = string
}

variable "redis_control_shards" {
  description = "Control Redis shard count (token bucket/counters, low volume)."
  type        = number
  default     = 1
}

variable "redis_session_shards" {
  description = "Session/stream Redis shard count (higher churn, scales first)."
  type        = number
  default     = 1
}

variable "redis_replicas_per_shard" {
  description = "Replicas per shard for Multi-AZ auto-failover."
  type        = number
  default     = 1
}

variable "redis_auth_token" {
  description = "ElastiCache AUTH token (RM-ENC). Empty only for scaffolding plans."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
