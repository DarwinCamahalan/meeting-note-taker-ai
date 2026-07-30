# secrets — Secrets Manager entries, one per logical name, per region (doc 60 §8).
#
# CRITICAL: only the container (name + KMS key) is created here. The secret VALUE
# is written out-of-band (CLI / console / a separate sealed pipeline) so plaintext
# NEVER lands in Terraform state. ECS task defs reference these ARNs in their
# `secrets` block; the value is decrypted at container start with the task role's
# kms:Decrypt. Regional admission control (doc 70 §4.4) => same names, DISTINCT
# values per region (cue-us vs cue-eu Anthropic/STT keys).

resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)

  name                    = "${var.name_prefix}/${each.value}"
  description             = "Cue ${each.value} (value managed out-of-band)."
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { SecretName = each.value })

  lifecycle {
    # The value is rotated/written outside Terraform; do not let TF clobber it.
    ignore_changes = [description]
  }
}
