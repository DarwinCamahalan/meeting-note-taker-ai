output "zone_id" {
  description = "Route53 hosted-zone id (root creates origin/failover records against it)."
  value       = local.zone_id
}

output "zone_name" {
  description = "Hosted-zone / apex domain name."
  value       = var.domain_name
}

output "api_fqdn" {
  description = "Public API hostname (served by CloudFront)."
  value       = local.api_fqdn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name (null when disabled)."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.api[0].domain_name : null
}
