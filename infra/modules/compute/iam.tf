# IAM — least privilege (doc 60 §1, §8):
#   - one shared task EXECUTION role (ECR pull, log write, secret+KMS decrypt)
#   - one task role PER service, scoped to only that service's secret ARNs

data "aws_iam_policy_document" "assume_ecs_tasks" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ---- Execution role (used by the ECS agent to start the task) --------------

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role must read the injected secrets + decrypt them at container start.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = length(var.secret_arns) > 0 ? values(var.secret_arns) : ["*"]
  }
  statement {
    sid       = "DecryptSecrets"
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name_prefix}-ecs-exec-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# ---- Per-service task roles (the running container's identity) -------------

resource "aws_iam_role" "task" {
  for_each           = var.services
  name               = "${var.name_prefix}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
  tags               = merge(var.tags, { Service = each.key })
}

# Each task role may read ONLY the secrets its service declares (doc 60 §1).
data "aws_iam_policy_document" "task" {
  for_each = var.services

  dynamic "statement" {
    for_each = length(each.value.secret_keys) > 0 ? [1] : []
    content {
      sid     = "ReadOwnSecrets"
      actions = ["secretsmanager:GetSecretValue"]
      resources = [
        for key in each.value.secret_keys : var.secret_arns[key] if contains(keys(var.secret_arns), key)
      ]
    }
  }

  dynamic "statement" {
    for_each = length(each.value.secret_keys) > 0 ? [1] : []
    content {
      sid       = "DecryptOwnSecrets"
      actions   = ["kms:Decrypt"]
      resources = [var.kms_key_arn]
    }
  }

  # ECS Exec channel (only when enabled).
  dynamic "statement" {
    for_each = var.enable_execute_command ? [1] : []
    content {
      sid = "ExecuteCommand"
      actions = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "task" {
  for_each = var.services
  name     = "${var.name_prefix}-${each.key}-task"
  role     = aws_iam_role.task[each.key].id
  policy   = data.aws_iam_policy_document.task[each.key].json
}
