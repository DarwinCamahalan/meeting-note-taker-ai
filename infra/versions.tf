# Cue — Terraform / provider version constraints (Phase 4, doc 60 §4).
# Pinned floors keep `plan` reproducible across CI + local; no state backend or
# credentials live here (see backend.tf, providers.tf).

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    # Cloudflare (R2 installer + update-feed host, ADR-INF-02) is optional and
    # OFF by default — the release-artifacts store toggles to R2 via
    # var.release_store = "r2". Uncomment + configure to enable.
    # cloudflare = {
    #   source  = "cloudflare/cloudflare"
    #   version = "~> 4.40"
    # }
  }
}
