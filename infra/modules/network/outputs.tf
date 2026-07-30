output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "VPC CIDR."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet ids (ALB, NAT)."
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "Private app subnet ids (Fargate tasks)."
  value       = aws_subnet.private_app[*].id
}

output "private_data_subnet_ids" {
  description = "Private data subnet ids (Aurora, Redis)."
  value       = aws_subnet.private_data[*].id
}

output "alb_security_group_id" {
  description = "Public ALB security group id."
  value       = aws_security_group.alb.id
}

output "alb_internal_security_group_id" {
  description = "Internal ALB security group id."
  value       = aws_security_group.alb_internal.id
}

output "app_security_group_id" {
  description = "App-tier (Fargate) security group id."
  value       = aws_security_group.app.id
}

output "data_security_group_id" {
  description = "Data-tier (Aurora/Redis) security group id."
  value       = aws_security_group.data.id
}
