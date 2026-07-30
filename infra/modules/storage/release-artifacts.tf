# Release artifacts — signed installers + latest*.yml + *.minisig (doc 60 §7).
#
# Canonical home is Cloudflare R2 (ADR-INF-02: zero egress at installer scale).
# This file provisions an OPTIONAL AWS-native release bucket for release_store
# == "s3" (staging mirror or R2-free deployments). The R2 path is documented
# below; enable the cloudflare provider in versions.tf to use it.

locals {
  create_s3_release = var.release_store == "s3"
  release_bucket    = "${var.name_prefix}-releases-${var.region}"
}

resource "aws_s3_bucket" "releases" {
  count         = local.create_s3_release ? 1 : 0
  bucket        = local.release_bucket
  force_destroy = false # immutable per-version objects, never overwritten (doc 60 §9.1)
  tags          = merge(var.tags, { Name = local.release_bucket, Purpose = "release-artifacts" })
}

resource "aws_s3_bucket_public_access_block" "releases" {
  count                   = local.create_s3_release ? 1 : 0
  bucket                  = aws_s3_bucket.releases[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "releases" {
  count  = local.create_s3_release ? 1 : 0
  bucket = aws_s3_bucket.releases[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  count  = local.create_s3_release ? 1 : 0
  bucket = aws_s3_bucket.releases[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# ---- Cloudflare R2 (documented; requires the cloudflare provider) ----------
#
# When var.release_store == "r2", installers + latest*.yml are served from
# dl.cue.app on R2 (ADR-INF-02). The desktop release pipeline
# (.github/workflows/release-desktop.yml) publishes there, then minisigns the
# manifest (doc 60 §7.7). Uncomment after enabling the provider in versions.tf:
#
# resource "cloudflare_r2_bucket" "releases" {
#   count      = var.release_store == "r2" ? 1 : 0
#   account_id = var.cloudflare_account_id
#   name       = "${var.name_prefix}-releases"
#   location   = "WNAM"
# }
