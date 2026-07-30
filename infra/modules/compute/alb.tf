# ALBs + target groups (doc 60 §2, §2.2).
#   public ALB   — api (default) + ws-gateway (host rule). WSS terminates here.
#   internal ALB — ai-orchestrator gRPC (protocol_version GRPC, in-VPC only).
# ai-orchestrator is NOT internet-exposed; ws-gateway dials it via the internal ALB.

# ---- Public ALB ------------------------------------------------------------

resource "aws_lb" "public" {
  name               = "${var.name_prefix}-pub"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  idle_timeout               = 300 # long-lived WS relays (doc 70 §2.1)
  drop_invalid_header_fields = true
  enable_http2               = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-public-alb" })
}

resource "aws_lb" "internal" {
  name               = "${var.name_prefix}-int"
  load_balancer_type = "application"
  internal           = true
  security_groups    = [var.alb_internal_security_group_id]
  subnets            = var.private_app_subnet_ids

  enable_http2 = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-internal-alb" })
}

# ---- Target groups (one per service) ---------------------------------------

resource "aws_lb_target_group" "this" {
  for_each = var.services

  name             = "${var.name_prefix}-${each.key}"
  port             = each.value.container_port
  protocol         = "HTTP"
  protocol_version = each.value.protocol_version # HTTP1 | HTTP2 | GRPC
  target_type      = "ip"                        # awsvpc / Fargate
  vpc_id           = var.vpc_id

  deregistration_delay = each.value.stop_timeout # align with SIGTERM drain

  health_check {
    enabled             = true
    path                = each.value.health_check_path
    protocol            = "HTTP"
    matcher             = each.value.protocol_version == "GRPC" ? "0-99" : "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(var.tags, { Service = each.key })

  lifecycle { create_before_destroy = true }
}

# ---- Public listeners ------------------------------------------------------

# HTTP :80 -> redirect to HTTPS (only meaningful when a cert exists).
resource "aws_lb_listener" "public_http" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  # dev fallback: no cert -> serve api over :80 directly.
  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.this[local.default_public_service].arn
    }
  }
}

resource "aws_lb_listener" "public_https" {
  count             = local.https_enabled ? 1 : 0
  load_balancer_arn = aws_lb.public.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[local.default_public_service].arn
  }
}

# Host-based rules for non-default public services (e.g. ws-gateway).
resource "aws_lb_listener_rule" "public_host" {
  for_each = { for k, s in local.public_services : k => s if s.host_header != "" }

  listener_arn = local.https_enabled ? aws_lb_listener.public_https[0].arn : aws_lb_listener.public_http.arn
  priority     = 100 + index(keys(local.public_services), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[each.key].arn
  }

  condition {
    host_header {
      values = [each.value.host_header]
    }
  }
}

# ---- Internal listener (gRPC ai-orchestrator) ------------------------------
# gRPC over ALB requires an HTTPS/HTTP2 listener; when no cert is available
# (dev), fall back to a plain HTTP forward for local plaintext gRPC.

resource "aws_lb_listener" "internal" {
  count             = length(local.internal_services) > 0 ? 1 : 0
  load_balancer_arn = aws_lb.internal.arn
  port              = local.https_enabled ? 443 : 8443
  protocol          = local.https_enabled ? "HTTPS" : "HTTP"
  ssl_policy        = local.https_enabled ? "ELBSecurityPolicy-TLS13-1-2-2021-06" : null
  certificate_arn   = local.https_enabled ? var.certificate_arn : null

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[one(keys(local.internal_services))].arn
  }
}
