# Aurora Serverless v2, PostgreSQL 16 + pgvector (doc 60 §2.3, ADR-INF-01).
#
# pgvector ships with Aurora PG 16 — enabled per-database via `CREATE EXTENSION
# vector` in the Drizzle migrations (doc 30), not a cluster param. The custom
# parameter groups exist to force TLS and expose HNSW tuning knobs (doc 70 §2.4).

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.name_prefix}-aurora"
  subnet_ids = var.data_subnet_ids
  tags       = merge(var.tags, { Name = "${var.name_prefix}-aurora-subnets" })
}

resource "aws_rds_cluster_parameter_group" "aurora" {
  name        = "${var.name_prefix}-aurora-cluster"
  family      = "aurora-postgresql16"
  description = "Cue Aurora PG16 cluster params (force TLS)."

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = var.tags
}

resource "aws_db_parameter_group" "aurora" {
  name        = "${var.name_prefix}-aurora-instance"
  family      = "aurora-postgresql16"
  description = "Cue Aurora PG16 instance params."
  tags        = var.tags
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier = "${var.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # Serverless v2 runs under provisioned mode
  engine_version     = var.postgres_engine_version

  database_name   = var.database_name
  master_username = var.master_username
  # Password lives in Secrets Manager, managed + rotated by RDS (doc 60 §8) —
  # never in tfvars or state as plaintext.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.kms_key_arn

  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [var.data_security_group_id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name

  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  backup_retention_period         = var.aurora_backup_retention_days
  preferred_backup_window         = "03:00-04:00"
  copy_tags_to_snapshot           = true
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = !var.deletion_protection
  final_snapshot_identifier       = var.deletion_protection ? "${var.name_prefix}-aurora-final" : null
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-aurora" })

  lifecycle {
    ignore_changes = [engine_version] # minor-version auto-upgrade drift
  }
}

# Writer + N readers. Reader instances absorb RAG vector-search reads (doc 70 §2.4).
resource "aws_rds_cluster_instance" "aurora" {
  count              = 1 + var.aurora_replica_count
  identifier         = "${var.name_prefix}-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  db_parameter_group_name = aws_db_parameter_group.aurora.name
  promotion_tier          = count.index # 0 = preferred writer

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-aurora-${count.index == 0 ? "writer" : "reader"}"
  })
}
