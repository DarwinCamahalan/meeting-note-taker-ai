output "uploads_bucket" {
  description = "User-uploads bucket name."
  value       = aws_s3_bucket.uploads.id
}

output "uploads_bucket_arn" {
  description = "User-uploads bucket ARN (for task-role scoping)."
  value       = aws_s3_bucket.uploads.arn
}

output "backups_bucket" {
  description = "DB-backups bucket name."
  value       = aws_s3_bucket.backups.id
}

output "backups_bucket_arn" {
  description = "DB-backups bucket ARN."
  value       = aws_s3_bucket.backups.arn
}

output "releases_bucket" {
  description = "Release-artifacts bucket name (null when release_store == r2)."
  value       = local.create_s3_release ? aws_s3_bucket.releases[0].id : null
}
