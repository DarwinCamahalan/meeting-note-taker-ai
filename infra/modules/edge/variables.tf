variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "domain_name" {
  description = "Apex domain, e.g. cue.app."
  type        = string
}

variable "api_subdomain" {
  description = "API hostname label, e.g. \"api\" -> api.cue.app."
  type        = string
  default     = "api"
}

variable "manage_route53_zone" {
  description = "true = create the hosted zone; false = data-source an existing one."
  type        = bool
  default     = false
}

variable "enable_cloudfront" {
  description = "Create the CloudFront distribution in front of the api ALB."
  type        = bool
  default     = true
}

variable "origin_alb_domain" {
  description = <<-EOT
    Stable origin hostname CloudFront points at (e.g. origin.api.cue.app). The
    Route53 alias origin -> ALB is created at the root (it needs the regional ALB
    output), so this stays a plain string here and NO compute output is
    referenced by this module — keeping the edge<->compute graph acyclic.
  EOT
  type        = string
  default     = ""
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
