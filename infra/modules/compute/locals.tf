data "aws_caller_identity" "current" {}

locals {
  ecr_registry = var.ecr_registry != "" ? var.ecr_registry : "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"

  https_enabled = var.certificate_arn != ""

  # Services fronted by each ALB.
  public_services   = { for k, s in var.services : k => s if s.alb == "public" }
  internal_services = { for k, s in var.services : k => s if s.alb == "internal" }

  # The single default (path "/") public service — first without a host header.
  default_public_service = one([for k, s in local.public_services : k if s.host_header == ""])
}
