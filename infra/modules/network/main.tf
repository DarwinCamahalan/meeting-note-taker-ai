# network — VPC, 3-tier subnets, NAT, route tables, VPC endpoints, security
# groups (doc 60 §2.1). Region-agnostic; instantiated once per region.
#
# Subnet layout per AZ (matches doc 60 §2.1 for a 10.x.0.0/16 VPC):
#   public       10.x.0.0/24  10.x.1.0/24    (ALB + NAT)
#   private_app  10.x.10.0/24 10.x.11.0/24   (all Fargate tasks)
#   private_data 10.x.20.0/24 10.x.21.0/24   (Aurora + ElastiCache, no egress)

data "aws_availability_zones" "this" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.this.names, 0, var.az_count)

  public_subnets       = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i)]
  private_app_subnets  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, 10 + i)]
  private_data_subnets = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, 20 + i)]

  nat_count = var.single_nat_gateway ? 1 : var.az_count
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name_prefix}-igw" })
}

# ---- Subnets ---------------------------------------------------------------

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-${local.azs[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_app" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_app_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-${local.azs[count.index]}"
    Tier = "private-app"
  })
}

resource "aws_subnet" "private_data" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_data_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-data-${local.azs[count.index]}"
    Tier = "private-data"
  })
}

# ---- NAT + routing ---------------------------------------------------------

resource "aws_eip" "nat" {
  count  = local.nat_count
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name_prefix}-nat-eip-${count.index}" })
}

resource "aws_nat_gateway" "this" {
  count         = local.nat_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = merge(var.tags, { Name = "${var.name_prefix}-nat-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name_prefix}-rt-public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# One private route table per AZ so each app subnet egresses via its own (or the
# single shared) NAT GW.
resource "aws_route_table" "private_app" {
  count  = var.az_count
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name_prefix}-rt-app-${count.index}" })
}

resource "aws_route" "private_app_nat" {
  count                  = var.az_count
  route_table_id         = aws_route_table.private_app[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
}

resource "aws_route_table_association" "private_app" {
  count          = var.az_count
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

# Data subnets have NO internet egress (doc 60 §2.1: VPC endpoints only).
resource "aws_route_table" "private_data" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name_prefix}-rt-data" })
}

resource "aws_route_table_association" "private_data" {
  count          = var.az_count
  subnet_id      = aws_subnet.private_data[count.index].id
  route_table_id = aws_route_table.private_data.id
}
