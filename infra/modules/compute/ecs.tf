# ECS cluster + Fargate task definitions + services (doc 60 §2.2).
# Graceful drain: stopTimeout per service (SIGTERM -> finish streams -> exit,
# doc 60 §6.2). Session state is in Redis, so a drained ws-gateway task loses no
# call (doc 70 §2.1). Service Connect gives internal TLS (RM-ENC).

resource "aws_ecs_cluster" "this" {
  name = var.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# Internal service-to-service discovery + TLS (doc 70 §5, RM-ENC internal TLS).
resource "aws_service_discovery_http_namespace" "this" {
  name        = var.name_prefix
  description = "Cue Service Connect namespace (${var.region})."
  tags        = var.tags
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = var.services
  name              = "/ecs/${var.name_prefix}/${each.key}"
  retention_in_days = var.log_retention_days
  tags              = merge(var.tags, { Service = each.key })
}

# ---- Task definitions ------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  for_each = var.services

  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64" # Graviton (cost, doc 60 §10)
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${local.ecr_registry}/${var.name_prefix}-${each.key}:${var.image_tag}"
      essential = true
      # SIGTERM drain window (doc 60 §6.2): ai-orchestrator/ws-gateway finish
      # in-flight streams before exit.
      stopTimeout = each.value.stop_timeout

      portMappings = [
        {
          name          = each.key
          containerPort = each.value.container_port
          protocol      = "tcp"
          appProtocol   = each.value.protocol_version == "GRPC" ? "grpc" : "http"
        },
      ]

      environment = [
        for k, v in each.value.environment : { name = k, value = v }
      ]

      # Secret injection by ARN — decrypted at start, never in the image/state.
      secrets = [
        for key in each.value.secret_keys :
        { name = key, valueFrom = var.secret_arns[key] }
        if contains(keys(var.secret_arns), key)
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.service[each.key].name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = each.key
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"process.exit(0)\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
    },
  ])

  tags = merge(var.tags, { Service = each.key })
}

# ---- Services --------------------------------------------------------------

resource "aws_ecs_service" "this" {
  for_each = var.services

  name            = each.key
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this[each.key].arn
  desired_count   = each.value.desired_count
  launch_type     = "FARGATE"

  enable_execute_command = var.enable_execute_command

  # Rolling deploys with circuit breaker + auto-rollback (doc 60 §6.2).
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.private_app_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this[each.key].arn
    container_name   = each.key
    container_port   = each.value.container_port
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.this.arn
  }

  # desired_count is owned by Application Auto Scaling after create.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.public_http,
    aws_lb_listener.public_https,
    aws_lb_listener.internal,
  ]

  tags = merge(var.tags, { Service = each.key })
}
