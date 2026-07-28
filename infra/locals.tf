locals {
  name_prefix = "${var.project_name}-${var.environment}"

  cms_fqdn = "${var.cms_subdomain}.${var.domain_name}"
  api_fqdn = "${var.api_subdomain}.${var.domain_name}"

  cms_url = "https://${local.cms_fqdn}"
  api_url = "https://${local.api_fqdn}"

  tiktok_redirect_uri = "${local.api_url}/tiktok/oauth/callback"

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}
