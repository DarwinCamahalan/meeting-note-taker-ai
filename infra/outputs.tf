# Root outputs — the handles operators + CI need after an apply.

output "api_url" {
  description = "Public API URL (CloudFront) when edge is enabled."
  value       = local.edge_enabled ? "https://${module.edge[0].api_fqdn}" : null
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name."
  value       = local.edge_enabled ? module.edge[0].cloudfront_domain : null
}

# ---- Primary region --------------------------------------------------------

output "primary_vpc_id" {
  description = "Primary-region VPC id."
  value       = module.network_primary.vpc_id
}

output "primary_public_alb_dns" {
  description = "Primary-region public ALB DNS name."
  value       = module.compute_primary.public_alb_dns_name
}

output "primary_ecs_cluster" {
  description = "Primary-region ECS cluster name (deploy.yml target)."
  value       = module.compute_primary.cluster_name
}

output "primary_service_names" {
  description = "Primary-region ECS service names."
  value       = module.compute_primary.service_names
}

output "primary_aurora_endpoint" {
  description = "Primary-region Aurora writer endpoint."
  value       = module.data_primary.cluster_endpoint
}

output "primary_aurora_reader_endpoint" {
  description = "Primary-region Aurora reader endpoint (RAG reads)."
  value       = module.data_primary.reader_endpoint
}

output "primary_redis_control_endpoint" {
  description = "Primary-region control Redis endpoint."
  value       = module.data_primary.redis_control_endpoint
}

output "primary_redis_session_endpoint" {
  description = "Primary-region session/stream Redis endpoint."
  value       = module.data_primary.redis_session_endpoint
}

output "primary_uploads_bucket" {
  description = "Primary-region user-uploads bucket."
  value       = module.storage_primary.uploads_bucket
}

output "primary_kms_key_arn" {
  description = "Primary-region KMS CMK arn."
  value       = aws_kms_key.primary.arn
}

# ---- Secondary region (null when disabled) ---------------------------------

output "secondary_public_alb_dns" {
  description = "Secondary-region public ALB DNS (null when disabled)."
  value       = local.secondary_enabled ? module.compute_secondary[0].public_alb_dns_name : null
}

output "secondary_ecs_cluster" {
  description = "Secondary-region ECS cluster name (null when disabled)."
  value       = local.secondary_enabled ? module.compute_secondary[0].cluster_name : null
}

output "secondary_aurora_endpoint" {
  description = "Secondary-region Aurora writer endpoint (null when disabled)."
  value       = local.secondary_enabled ? module.data_secondary[0].cluster_endpoint : null
}
