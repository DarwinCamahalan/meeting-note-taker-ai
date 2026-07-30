variable "name_prefix" {
  description = "Resource name/tag prefix, e.g. cue-prod."
  type        = string
}

variable "region" {
  description = "AWS region this VPC lives in (for naming/tags only)."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR (a /16). Subnets are derived as /24s (doc 60 §2.1)."
  type        = string
}

variable "az_count" {
  description = "Number of AZs to spread subnets across (2 or 3)."
  type        = number
}

variable "single_nat_gateway" {
  description = "One shared NAT GW (cheap, dev/staging) vs one per AZ (prod HA)."
  type        = bool
  default     = true
}

variable "container_ports" {
  description = "App container ports the ALB SG may reach on the app SG."
  type        = list(number)
  default     = [3000, 3001, 3002, 50051, 9464]
}

variable "tags" {
  description = "Base tags."
  type        = map(string)
  default     = {}
}
