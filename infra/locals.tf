# Cue — root locals: naming + the mandatory tag set (doc 60 §10 FinOps tagging).

locals {
  name_prefix = "${var.project}-${var.environment}"

  # Every resource carries these (Cost Explorer + budgets slice on them).
  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      CostCenter  = var.cost_center
      ManagedBy   = "terraform"
    },
    var.extra_tags,
  )

  edge_enabled = var.domain_name != ""
}
