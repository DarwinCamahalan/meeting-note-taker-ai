output "cluster_endpoint" {
  description = "Aurora writer endpoint (primary connection)."
  value       = aws_rds_cluster.aurora.endpoint
}

output "reader_endpoint" {
  description = "Aurora reader endpoint (RAG / read-heavy load, doc 70 §2.4)."
  value       = aws_rds_cluster.aurora.reader_endpoint
}

output "database_name" {
  description = "Initial database name."
  value       = aws_rds_cluster.aurora.database_name
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master credentials."
  value       = try(aws_rds_cluster.aurora.master_user_secret[0].secret_arn, null)
}

output "redis_control_endpoint" {
  description = "Control Redis configuration endpoint (token bucket/counters)."
  value       = aws_elasticache_replication_group.redis["control"].configuration_endpoint_address
}

output "redis_session_endpoint" {
  description = "Session/stream Redis configuration endpoint."
  value       = aws_elasticache_replication_group.redis["session"].configuration_endpoint_address
}

output "redis_port" {
  description = "Redis port."
  value       = 6379
}
