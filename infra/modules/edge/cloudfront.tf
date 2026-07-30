# CloudFront in front of the api ALB (doc 60 §2). Terminates TLS at the edge on
# api.cue.app, forwards to the stable origin hostname (origin.api.cue.app ->
# ALB, aliased at the root). API traffic is dynamic, so caching is effectively
# disabled (CachingDisabled) and all headers/cookies/query are forwarded.

resource "aws_cloudfront_distribution" "api" {
  count = var.enable_cloudfront ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix} api edge"
  aliases         = [local.api_fqdn]
  price_class     = "PriceClass_100"

  origin {
    domain_name = var.origin_alb_domain != "" ? var.origin_alb_domain : "origin.${local.api_fqdn}"
    origin_id   = "api-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "api-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]

    # AWS managed policies: CachingDisabled + AllViewerExceptHostHeader.
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-api-cdn" })
}

# User-facing api.cue.app -> CloudFront.
resource "aws_route53_record" "api" {
  count   = var.enable_cloudfront ? 1 : 0
  zone_id = local.zone_id
  name    = local.api_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api[0].domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront's fixed hosted-zone id
    evaluate_target_health = false
  }
}
