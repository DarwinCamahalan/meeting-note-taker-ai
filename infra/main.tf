# Cue root stack — primary region (default aws provider) + global edge.
# The secondary region (eu-west-1) is a symmetric instantiation in
# secondary-region.tf, gated by var.enable_secondary_region.
#
# Wiring order within a region: kms -> secrets/storage/data/network -> compute.
# Cross-module graph is acyclic: edge (global) -> regional ACM cert -> compute;
# the origin -> ALB alias is created HERE (root) so edge never references compute.

# ---- KMS CMK (primary region) ----------------------------------------------
# Separate keys per environment; this key covers app secrets + data-at-rest
# + object storage in the primary region (doc 60 §8: KMS CMKs per environment).

resource "aws_kms_key" "primary" {
  description             = "${local.name_prefix} primary-region CMK (secrets, RDS, Redis, S3)."
  deletion_window_in_days = 14
  enable_key_rotation     = true
  tags                    = merge(local.common_tags, { Name = "${local.name_prefix}-cmk" })
}

resource "aws_kms_alias" "primary" {
  name          = "alias/${local.name_prefix}-${var.primary_region}"
  target_key_id = aws_kms_key.primary.key_id
}

# ---- Global edge (Route53 / ACM-for-CloudFront / CloudFront) ---------------
# Runs in us-east-1 via the aws.global provider (CloudFront cert requirement).

module "edge" {
  count  = local.edge_enabled ? 1 : 0
  source = "./modules/edge"
  providers = {
    aws = aws.global
  }

  name_prefix         = local.name_prefix
  domain_name         = var.domain_name
  api_subdomain       = var.api_subdomain
  manage_route53_zone = var.manage_route53_zone
  enable_cloudfront   = var.enable_cloudfront
  tags                = local.common_tags
}

# ---- Regional ALB certificate (primary) ------------------------------------
# ACM cert for the primary ALB HTTPS listeners, DNS-validated against the edge
# zone. Created at the root so edge stays compute-agnostic (see header).

resource "aws_acm_certificate" "alb_primary" {
  count             = local.edge_enabled ? 1 : 0
  domain_name       = "origin.${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = merge(local.common_tags, { Name = "${local.name_prefix}-alb-cert" })
}

resource "aws_route53_record" "alb_primary_validation" {
  for_each = local.edge_enabled ? {
    for dvo in aws_acm_certificate.alb_primary[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = module.edge[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "alb_primary" {
  count                   = local.edge_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.alb_primary[0].arn
  validation_record_fqdns = [for r in aws_route53_record.alb_primary_validation : r.fqdn]
}

# ---- Primary region stack --------------------------------------------------

module "network_primary" {
  source = "./modules/network"

  name_prefix        = "${local.name_prefix}-${var.primary_region}"
  region             = var.primary_region
  vpc_cidr           = var.vpc_cidr_primary
  az_count           = var.az_count
  single_nat_gateway = var.single_nat_gateway
  tags               = local.common_tags
}

module "secrets_primary" {
  source = "./modules/secrets"

  name_prefix  = "${local.name_prefix}-${var.primary_region}"
  secret_names = var.secret_names
  kms_key_arn  = aws_kms_key.primary.arn
  tags         = local.common_tags
}

module "storage_primary" {
  source = "./modules/storage"

  name_prefix        = local.name_prefix
  region             = var.primary_region
  kms_key_arn        = aws_kms_key.primary.arn
  uploads_versioning = var.uploads_versioning
  release_store      = var.release_store
  force_destroy      = var.environment == "dev"
  tags               = local.common_tags
}

module "data_primary" {
  source = "./modules/data"

  name_prefix                  = "${local.name_prefix}-${var.primary_region}"
  vpc_id                       = module.network_primary.vpc_id
  data_subnet_ids              = module.network_primary.private_data_subnet_ids
  data_security_group_id       = module.network_primary.data_security_group_id
  kms_key_arn                  = aws_kms_key.primary.arn
  aurora_min_acu               = var.aurora_min_acu
  aurora_max_acu               = var.aurora_max_acu
  aurora_backup_retention_days = var.aurora_backup_retention_days
  deletion_protection          = var.environment == "prod"
  redis_node_type              = var.redis_node_type
  redis_control_shards         = var.redis_control_shards
  redis_session_shards         = var.redis_session_shards
  redis_auth_token             = var.redis_auth_token
  tags                         = local.common_tags
}

module "compute_primary" {
  source = "./modules/compute"

  name_prefix                    = "${local.name_prefix}-${var.primary_region}"
  region                         = var.primary_region
  vpc_id                         = module.network_primary.vpc_id
  public_subnet_ids              = module.network_primary.public_subnet_ids
  private_app_subnet_ids         = module.network_primary.private_app_subnet_ids
  alb_security_group_id          = module.network_primary.alb_security_group_id
  alb_internal_security_group_id = module.network_primary.alb_internal_security_group_id
  app_security_group_id          = module.network_primary.app_security_group_id
  services                       = var.services
  image_tag                      = var.image_tag
  ecr_registry                   = var.ecr_registry
  secret_arns                    = module.secrets_primary.secret_arns
  kms_key_arn                    = aws_kms_key.primary.arn
  certificate_arn                = local.edge_enabled ? aws_acm_certificate_validation.alb_primary[0].certificate_arn : ""
  log_retention_days             = var.log_retention_days
  enable_execute_command         = var.environment != "prod"
  tags                           = local.common_tags
}

# ---- Origin + failover DNS (root owns these; needs both edge + compute) ----
# origin.api.cue.app -> primary ALB (PRIMARY failover record). CloudFront points
# at this stable hostname. Secondary failover record lives in secondary-region.tf.

resource "aws_route53_record" "origin_primary" {
  count   = local.edge_enabled ? 1 : 0
  zone_id = module.edge[0].zone_id
  name    = "origin.${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  set_identifier = "primary"
  failover_routing_policy {
    type = "PRIMARY"
  }

  alias {
    name                   = module.compute_primary.public_alb_dns_name
    zone_id                = module.compute_primary.public_alb_zone_id
    evaluate_target_health = true
  }
}
