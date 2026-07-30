# Cue — Terraform remote state backend (PLACEHOLDER, doc 60 §4.1).
#
# The state backend is the ONLY manual bootstrap in the whole stack (doc 60 §1):
# the S3 bucket + DynamoDB lock table must exist BEFORE the first `terraform init`
# (create them once, out-of-band, with the tiny bootstrap in infra/README.md).
#
# `backend` blocks CANNOT interpolate variables, so the real values are supplied
# per environment via `-backend-config` at init time (see README "Apply order"):
#
#   terraform init \
#     -backend-config="bucket=cue-tfstate-prod" \
#     -backend-config="key=prod/us-east-1/terraform.tfstate" \
#     -backend-config="region=us-east-1" \
#     -backend-config="dynamodb_table=cue-tflock" \
#     -backend-config="kms_key_id=alias/cue-tfstate"
#
# One state file per (environment × region). NEVER hardcode a real bucket, account
# id, or KMS arn in this file — the block below is left partial on purpose.

terraform {
  backend "s3" {
    # bucket         = "cue-tfstate-<env>"        # -backend-config at init
    # key            = "<env>/<region>/terraform.tfstate"
    # region         = "us-east-1"
    # dynamodb_table = "cue-tflock"               # state locking
    encrypt = true
    # kms_key_id     = "alias/cue-tfstate"
  }
}
