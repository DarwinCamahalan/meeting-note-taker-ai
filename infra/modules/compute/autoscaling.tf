# Application Auto Scaling (doc 70 §7).
# Scale-out aggressive, scale-in conservative (long cooldown) because long-lived
# connections make premature scale-in disruptive (doc 70 §7).
#
# CPU target-tracking is the baseline for every service. ws-gateway (active
# connections) and ai-orchestrator (in-flight streams) additionally scale on a
# custom CloudWatch metric emitted by @cue/observability — wired as a commented
# target-tracking policy below (needs the metric flowing first, doc 70 §7).

resource "aws_appautoscaling_target" "this" {
  for_each = var.services

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.min_count
  max_capacity       = each.value.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = var.services

  name               = "${var.name_prefix}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = each.value.target_cpu
    scale_in_cooldown  = 300 # conservative (doc 70 §7)
    scale_out_cooldown = 60  # aggressive
  }
}

# ALB request-count target-tracking for the api tier (doc 70 §7: RequestCountPerTarget).
resource "aws_appautoscaling_policy" "alb_requests" {
  for_each = { for k, s in local.public_services : k => s if s.host_header == "" }

  name               = "${var.name_prefix}-${each.key}-alb-req"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.public.arn_suffix}/${aws_lb_target_group.this[each.key].arn_suffix}"
    }
    target_value       = 1000
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ---- Custom-metric scaling (ws-gateway / ai-orchestrator), doc 70 §2.1/§3.3 --
#
# ws-gateway scales on active_connections and ai-orchestrator on inflight_streams
# (custom CW metrics from @cue/observability MetricsRegistry). Enable once the
# metrics are publishing to CloudWatch:
#
# resource "aws_appautoscaling_policy" "ws_connections" {
#   name               = "${var.name_prefix}-ws-gateway-conns"
#   policy_type        = "TargetTrackingScaling"
#   resource_id        = aws_appautoscaling_target.this["ws-gateway"].resource_id
#   scalable_dimension = "ecs:service:DesiredCount"
#   service_namespace  = "ecs"
#   target_tracking_scaling_policy_configuration {
#     customized_metric_specification {
#       metric_name = "active_connections"
#       namespace   = "Cue/ws-gateway"
#       statistic   = "Average"
#     }
#     target_value       = 1500  # ~60% of per-task ceiling (doc 70 §3.3)
#     scale_in_cooldown  = 600
#     scale_out_cooldown = 60
#   }
# }
