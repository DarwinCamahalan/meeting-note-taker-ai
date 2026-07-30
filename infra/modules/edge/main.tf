# edge — Route53 + ACM (CloudFront cert) + CloudFront (doc 60 §2).
#
# IMPORTANT: this module MUST run in us-east-1 (CloudFront ACM requirement). The
# root passes it `providers = { aws = aws.global }`. Route53 + CloudFront are
# global anyway, so a single us-east-1 provider covers the whole module.
#
# It references NO compute outputs (origin is a stable hostname string); the
# origin -> ALB alias + per-region latency/failover records are created at the
# root. That keeps the edge <-> compute module graph acyclic.

locals {
  api_fqdn = "${var.api_subdomain}.${var.domain_name}"
}

# ---- Hosted zone -----------------------------------------------------------

resource "aws_route53_zone" "this" {
  count = var.manage_route53_zone ? 1 : 0
  name  = var.domain_name
  tags  = merge(var.tags, { Name = var.domain_name })
}

data "aws_route53_zone" "this" {
  count        = var.manage_route53_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

locals {
  zone_id = var.manage_route53_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.this[0].zone_id
}

# ---- ACM cert for CloudFront (must be us-east-1) ---------------------------

resource "aws_acm_certificate" "cdn" {
  domain_name       = local.api_fqdn
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }

  tags = merge(var.tags, { Name = "${var.name_prefix}-cdn-cert" })
}

resource "aws_route53_record" "cdn_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cdn" {
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for r in aws_route53_record.cdn_validation : r.fqdn]
}
