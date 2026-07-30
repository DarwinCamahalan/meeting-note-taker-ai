# VPC endpoints (doc 60 §2.1): data-subnet traffic to AWS services never
# traverses NAT/Internet. S3 is a gateway endpoint (free); the rest are
# interface endpoints in the app subnets.

data "aws_region" "current" {}

# S3 gateway endpoint — attached to app + data route tables.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = concat(
    aws_route_table.private_app[*].id,
    [aws_route_table.private_data.id],
  )

  tags = merge(var.tags, { Name = "${var.name_prefix}-vpce-s3" })
}

locals {
  interface_endpoints = [
    "secretsmanager",
    "ecr.api",
    "ecr.dkr",
    "logs",
    "kms",
  ]
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(local.interface_endpoints)
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_app[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-vpce-${each.value}" })
}
