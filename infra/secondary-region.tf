# Cue root stack — SECONDARY region (eu-west-1, EU residency / DR).
#
# Symmetric to the primary block in main.tf: the SAME modules, instantiated
# under the aws.eu provider and gated by var.enable_secondary_region. dev/staging
# leave this off (single-region); prod turns it on (doc 60 §5, doc 70 §4).
#
# No user PII replicates across regions — each region owns its own Aurora/Redis/
# S3/secrets (region pinning is the residency guarantee, doc 70 §4). The secondary
# region shares only the global edge (Route53/CloudFront) via a failover record.

locals {
  secondary_enabled = var.enable_secondary_region
  secondary_count   = local.secondary_enabled ? 1 : 0
}

# ---- KMS CMK (secondary region) --------------------------------------------

resource "aws_kms_key" "secondary" {
  count                   = local.secondary_count
  provider                = aws.eu
  description             = "${local.name_prefix} secondary-region CMK."
  deletion_window_in_days = 14
  enable_key_rotation     = true
  tags                    = merge(local.common_tags, { Name = "${local.name_prefix}-cmk-eu" })
}

resource "aws_kms_alias" "secondary" {
  count         = local.secondary_count
  provider      = aws.eu
  name          = "alias/${local.name_prefix}-${var.secondary_region}"
  target_key_id = aws_kms_key.secondary[0].key_id
}

# ---- Secondary regional ALB certificate ------------------------------------
# Issued in eu-west-1 (aws.eu) for the secondary ALB, validated against the same
# global edge zone.

resource "aws_acm_certificate" "alb_secondary" {
  count             = local.edge_enabled && local.secondary_enabled ? 1 : 0
  provider          = aws.eu
  domain_name       = "origin-eu.${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = merge(local.common_tags, { Name = "${local.name_prefix}-alb-cert-eu" })
}

resource "aws_route53_record" "alb_secondary_validation" {
  for_each = (local.edge_enabled && local.secondary_enabled) ? {
    for dvo in aws_acm_certificate.alb_secondary[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "alb_secondary" {
  count                   = local.edge_enabled && local.secondary_enabled ? 1 : 0
  provider                = aws.eu
  certificate_arn         = aws_acm_certificate.alb_secondary[0].arn
  validation_record_fqdns = [for r in aws_route53_record.alb_secondary_validation : r.fqdn]
}

# ---- Secondary region stack ------------------------------------------------

module "network_secondary" {
  source    = "./modules/network"
  count     = local.secondary_count
  providers = { aws = aws.eu }

  name_prefix        = "${local.name_prefix}-${var.secondary_region}"
  region             = var.secondary_region
  vpc_cidr           = var.vpc_cidr_secondary
  az_count           = var.az_count
  single_nat_gateway = var.single_nat_gateway
  tags               = local.common_tags
}

module "secrets_secondary" {
  source    = "./modules/secrets"
  count     = local.secondary_count
  providers = { aws = aws.eu }

  name_prefix  = "${local.name_prefix}-${var.secondary_region}"
  secret_names = var.secret_names
  kms_key_arn  = aws_kms_key.secondary[0].arn
  tags         = local.common_tags
}

module "storage_secondary" {
  source    = "./modules/storage"
  count     = local.secondary_count
  providers = { aws = aws.eu }

  name_prefix        = local.name_prefix
  region             = var.secondary_region
  kms_key_arn        = aws_kms_key.secondary[0].arn
  uploads_versioning = var.uploads_versioning
  release_store      = var.release_store
  force_destroy      = var.environment == "dev"
  tags               = local.common_tags
}

module "data_secondary" {
  source    = "./modules/data"
  count     = local.secondary_count
  providers = { aws = aws.eu }

  name_prefix                  = "${local.name_prefix}-${var.secondary_region}"
  vpc_id                       = module.network_secondary[0].vpc_id
  data_subnet_ids              = module.network_secondary[0].private_data_subnet_ids
  data_security_group_id       = module.network_secondary[0].data_security_group_id
  kms_key_arn                  = aws_kms_key.secondary[0].arn
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

module "compute_secondary" {
  source    = "./modules/compute"
  count     = local.secondary_count
  providers = { aws = aws.eu }

  name_prefix                    = "${local.name_prefix}-${var.secondary_region}"
  region                         = var.secondary_region
  vpc_id                         = module.network_secondary[0].vpc_id
  public_subnet_ids              = module.network_secondary[0].public_subnet_ids
  private_app_subnet_ids         = module.network_secondary[0].private_app_subnet_ids
  alb_security_group_id          = module.network_secondary[0].alb_security_group_id
  alb_internal_security_group_id = module.network_secondary[0].alb_internal_security_group_id
  app_security_group_id          = module.network_secondary[0].app_security_group_id
  services                       = var.services
  image_tag                      = var.image_tag
  ecr_registry                   = var.ecr_registry
  secret_arns                    = module.secrets_secondary[0].secret_arns
  kms_key_arn                    = aws_kms_key.secondary[0].arn
  certificate_arn                = local.edge_enabled ? aws_acm_certificate_validation.alb_secondary[0].certificate_arn : ""
  log_retention_days             = var.log_retention_days
  enable_execute_command         = false
  tags                           = local.common_tags
}

# ---- Secondary failover DNS ------------------------------------------------
# origin.api.cue.app SECONDARY failover -> eu-west-1 ALB (doc 60 §9.2 Route53
# failover). Route53 flips to this when the primary ALB health check fails.

resource "aws_route53_record" "origin_secondary" {
  count   = local.edge_enabled && local.secondary_enabled ? 1 : 0
  zone_id = module.edge[0].zone_id
  name    = "origin.${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  set_identifier = "secondary"
  failover_routing_policy {
    type = "SECONDARY"
  }

  alias {
    name                   = module.compute_secondary[0].public_alb_dns_name
    zone_id                = module.compute_secondary[0].public_alb_zone_id
    evaluate_target_health = true
  }
}
