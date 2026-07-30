variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "region" {
  description = "AWS region (for log-group + ECR host derivation)."
  type        = string
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the internet-facing ALB."
  type        = list(string)
}

variable "private_app_subnet_ids" {
  description = "Private app subnets for tasks + the internal ALB."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Public ALB security group."
  type        = string
}

variable "alb_internal_security_group_id" {
  description = "Internal ALB security group."
  type        = string
}

variable "app_security_group_id" {
  description = "Fargate task security group."
  type        = string
}

variable "services" {
  description = "Per-service Fargate config (see root variables.tf for shape)."
  type = map(object({
    container_port    = number
    cpu               = number
    memory            = number
    desired_count     = number
    min_count         = number
    max_count         = number
    health_check_path = string
    alb               = string
    protocol_version  = string
    host_header       = string
    target_cpu        = number
    stop_timeout      = number
    secret_keys       = list(string)
    environment       = map(string)
  }))
}

variable "image_tag" {
  description = "Immutable image tag promoted across envs (git SHA)."
  type        = string
}

variable "ecr_registry" {
  description = "ECR registry host. Empty = derive <acct>.dkr.ecr.<region>.amazonaws.com."
  type        = string
  default     = ""
}

variable "secret_arns" {
  description = "Map of logical secret name -> Secrets Manager ARN."
  type        = map(string)
}

variable "kms_key_arn" {
  description = "KMS CMK arn (task role kms:Decrypt for secret injection)."
  type        = string
}

variable "certificate_arn" {
  description = "Regional ACM cert arn for the ALB HTTPS listeners. Empty = HTTP-only (dev)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for task logs."
  type        = number
  default     = 30
}

variable "enable_execute_command" {
  description = "ECS Exec for debugging (off in prod unless needed)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
