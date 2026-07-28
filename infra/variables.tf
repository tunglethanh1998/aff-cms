variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Name prefix for resources"
  type        = string
  default     = "aff-cms"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Apex domain managed in Route 53"
  type        = string
  default     = "lethanhtung.click"
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for domain_name"
  type        = string
}

variable "cms_subdomain" {
  description = "Web (Next.js) subdomain"
  type        = string
  default     = "cms"
}

variable "api_subdomain" {
  description = "API (NestJS) subdomain"
  type        = string
  default     = "api"
}

variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.40.0.0/16"
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
  default     = "aff_cms"
}

variable "db_username" {
  description = "Postgres master username"
  type        = string
  default     = "aff_cms"
}

variable "db_password" {
  description = "Postgres master password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage (GB)"
  type        = number
  default     = 20
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "token_encryption_key" {
  description = "AES-256-GCM key as 64 hex characters"
  type        = string
  sensitive   = true
}

variable "tiktok_client_key" {
  description = "TikTok Login Kit client key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "tiktok_client_secret" {
  description = "TikTok Login Kit client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "admin_email" {
  description = "Seed admin email (for docs / one-off seed)"
  type        = string
  default     = "admin@lethanhtung.click"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 2048
}

variable "web_cpu" {
  type    = number
  default = 256
}

variable "web_memory" {
  type    = number
  default = 512
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "web_desired_count" {
  type    = number
  default = 1
}

variable "api_image_tag" {
  description = "ECR image tag for API (push images before first apply, or use placeholder then redeploy)"
  type        = string
  default     = "latest"
}

variable "web_image_tag" {
  description = "ECR image tag for Web"
  type        = string
  default     = "latest"
}
