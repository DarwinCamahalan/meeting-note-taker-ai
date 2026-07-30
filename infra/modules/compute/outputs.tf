output "cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "public_alb_dns_name" {
  description = "Public ALB DNS name (CloudFront/Route53 origin)."
  value       = aws_lb.public.dns_name
}

output "public_alb_zone_id" {
  description = "Public ALB hosted-zone id (for Route53 alias records)."
  value       = aws_lb.public.zone_id
}

output "public_alb_arn" {
  description = "Public ALB ARN."
  value       = aws_lb.public.arn
}

output "internal_alb_dns_name" {
  description = "Internal ALB DNS name (ws-gateway -> ai-orchestrator gRPC)."
  value       = aws_lb.internal.dns_name
}

output "service_names" {
  description = "Map of service key -> ECS service name."
  value       = { for k, s in aws_ecs_service.this : k => s.name }
}

output "task_role_arns" {
  description = "Map of service key -> task role ARN."
  value       = { for k, r in aws_iam_role.task : k => r.arn }
}
