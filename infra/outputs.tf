output "vpc_id" {
  value = aws_vpc.main.id
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "cms_url" {
  value = local.cms_url
}

output "api_url" {
  value = local.api_url
}

output "tiktok_redirect_uri" {
  value = local.tiktok_redirect_uri
}

output "ecr_api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_web_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_api_service_name" {
  value = aws_ecs_service.api.name
}

output "ecs_web_service_name" {
  value = aws_ecs_service.web.name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "s3_bucket" {
  value = aws_s3_bucket.assets.id
}

output "s3_public_base_url" {
  value = local.s3_public_base_url
}

output "api_secrets_arn" {
  value = aws_secretsmanager_secret.api.arn
}

output "aws_region" {
  value = var.aws_region
}

output "admin_email_hint" {
  value = var.admin_email
}
