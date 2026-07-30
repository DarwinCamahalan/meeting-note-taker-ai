# Security groups are the primary firewall (doc 60 §2.1):
#   internet --443--> alb_sg --app ports--> app_sg --5432/6379--> data_sg
# No SG allows 0.0.0.0/0 inbound except the ALB on 443/80.

# ---- ALB (internet-facing) -------------------------------------------------

resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  description = "Public ALB: 443/80 from the internet."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-alb" })

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from anywhere"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_redirect" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP (redirected to 443 at the listener)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "ALB to app tasks"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ---- Internal ALB (ai-orchestrator gRPC) -----------------------------------

resource "aws_security_group" "alb_internal" {
  name_prefix = "${var.name_prefix}-alb-int-"
  description = "Internal ALB for in-VPC gRPC (ai-orchestrator)."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-alb-internal" })

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "alb_internal_from_app" {
  security_group_id            = aws_security_group.alb_internal.id
  description                  = "gRPC from app tasks (ws-gateway dials ai-orchestrator)"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "alb_internal_all" {
  security_group_id = aws_security_group.alb_internal.id
  ip_protocol       = "-1"
  cidr_ipv4         = var.vpc_cidr
}

# ---- App tier (Fargate tasks) ----------------------------------------------

resource "aws_security_group" "app" {
  name_prefix = "${var.name_prefix}-app-"
  description = "Fargate tasks: inbound only from the ALBs."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-app" })

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  for_each                     = toset([for p in var.container_ports : tostring(p)])
  security_group_id            = aws_security_group.app.id
  description                  = "From public ALB on ${each.value}"
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_internal_alb" {
  for_each                     = toset([for p in var.container_ports : tostring(p)])
  security_group_id            = aws_security_group.app.id
  description                  = "From internal ALB on ${each.value}"
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  referenced_security_group_id = aws_security_group.alb_internal.id
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "App egress (NAT to providers, VPC endpoints, data tier)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ---- Data tier (Aurora + Redis) --------------------------------------------

resource "aws_security_group" "data" {
  name_prefix = "${var.name_prefix}-data-"
  description = "Aurora/Redis: inbound only from the app tier."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-data" })

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "data_postgres" {
  security_group_id            = aws_security_group.data.id
  description                  = "Postgres from app tier"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_ingress_rule" "data_redis" {
  security_group_id            = aws_security_group.data.id
  description                  = "Redis (TLS) from app tier"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.app.id
}

# No egress rule => data tier cannot initiate outbound (doc 60 §2.1).

# ---- VPC endpoints (interface) ---------------------------------------------

resource "aws_security_group" "vpce" {
  name_prefix = "${var.name_prefix}-vpce-"
  description = "Interface VPC endpoints: 443 from within the VPC."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name_prefix}-vpce" })

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "vpce_https" {
  security_group_id = aws_security_group.vpce.id
  description       = "HTTPS from VPC"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "vpce_all" {
  security_group_id = aws_security_group.vpce.id
  ip_protocol       = "-1"
  cidr_ipv4         = var.vpc_cidr
}
