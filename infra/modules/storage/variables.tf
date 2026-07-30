variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "region" {
  description = "Region (bucket names are globally unique, so region-suffixed)."
  type        = string
}

variable "kms_key_arn" {
  description = "KMS CMK arn for SSE-KMS on all buckets (doc 60 §2.3)."
  type        = string
}

variable "uploads_versioning" {
  description = "Enable versioning on the user-uploads bucket."
  type        = bool
  default     = true
}

variable "uploads_noncurrent_expiration_days" {
  description = "Expire noncurrent upload versions after N days (doc 60 §9.1: 90)."
  type        = number
  default     = 90
}

variable "backups_expiration_days" {
  description = "Expire logical backups after N days (doc 60 §9.1: 30)."
  type        = number
  default     = 30
}

variable "release_store" {
  description = "\"s3\" creates a release-artifacts bucket; \"r2\" documents the R2 path."
  type        = string
  default     = "s3"
}

variable "force_destroy" {
  description = "Allow non-empty bucket deletion (true only in dev)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
