# storage — S3 buckets for user uploads + DB backups (doc 60 §2.3, §9.1).
# All buckets: SSE-KMS, public access fully blocked, TLS-only bucket policy.
#
# Installers + latest*.yml normally live on Cloudflare R2 (ADR-INF-02, zero
# egress). When var.release_store == "s3" a release bucket is created here as an
# AWS-native alternative / staging mirror; when "r2" it is documented only
# (release-artifacts.tf) and served by the Cloudflare provider (versions.tf).

locals {
  uploads_bucket = "${var.name_prefix}-uploads-${var.region}"
  backups_bucket = "${var.name_prefix}-backups-${var.region}"
}

# ---- User uploads (resume / JD / knowledge base) ---------------------------

resource "aws_s3_bucket" "uploads" {
  bucket        = local.uploads_bucket
  force_destroy = var.force_destroy
  tags          = merge(var.tags, { Name = local.uploads_bucket, Purpose = "user-uploads" })
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = var.uploads_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {} # apply to all objects
    noncurrent_version_expiration {
      noncurrent_days = var.uploads_noncurrent_expiration_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ---- DB backups (pg_dump logical + snapshot copies) ------------------------

resource "aws_s3_bucket" "backups" {
  bucket        = local.backups_bucket
  force_destroy = var.force_destroy
  tags          = merge(var.tags, { Name = local.backups_bucket, Purpose = "db-backups" })
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "expire-logical-backups"
    status = "Enabled"
    filter {} # apply to all objects
    expiration {
      days = var.backups_expiration_days
    }
  }
}

# ---- TLS-only bucket policies (deny non-HTTPS) -----------------------------

data "aws_iam_policy_document" "tls_only" {
  for_each = {
    uploads = aws_s3_bucket.uploads.arn
    backups = aws_s3_bucket.backups.arn
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      each.value,
      "${each.value}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.tls_only["uploads"].json
}

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = data.aws_iam_policy_document.tls_only["backups"].json
}
