output "secret_arns" {
  description = "Map of logical secret name -> Secrets Manager ARN (for ECS task defs)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "secret_arn_list" {
  description = "Flat list of all secret ARNs (for IAM resource scoping)."
  value       = [for s in aws_secretsmanager_secret.this : s.arn]
}
