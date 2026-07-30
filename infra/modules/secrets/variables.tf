variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "secret_names" {
  description = "Logical secret names to provision (values written out-of-band)."
  type        = list(string)
}

variable "kms_key_arn" {
  description = "KMS CMK arn encrypting the secret material."
  type        = string
}

variable "recovery_window_days" {
  description = "Deletion recovery window (0 = immediate; use >0 in prod)."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
