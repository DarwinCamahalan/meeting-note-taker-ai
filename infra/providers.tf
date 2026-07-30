# Cue — AWS providers.
#
# Two regions, one control plane (doc 60 §1, doc 70 §4):
#   - default alias   -> var.primary_region   (us-east-1 primary)
#   - alias "eu"      -> var.secondary_region (eu-west-1, EU residency / DR)
#   - alias "global"  -> always us-east-1     (CloudFront ACM MUST live here)
#
# Region symmetry is intentional: the same modules are instantiated per region
# (main.tf = primary, secondary-region.tf = secondary via count + provider pass).
# No user PII crosses regions — region pinning is the residency guarantee
# (doc 70 §4), not a limitation to fix.

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "eu"
  region = var.secondary_region

  default_tags {
    tags = local.common_tags
  }
}

# CloudFront-attached ACM certificates must be issued in us-east-1 regardless of
# where the origin runs (an AWS hard requirement). This alias exists so the edge
# module can request that cert from us-east-1 even when the primary region is not.
provider "aws" {
  alias  = "global"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
