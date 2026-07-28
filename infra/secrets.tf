resource "aws_secretsmanager_secret" "api" {
  name                    = "${local.name_prefix}/api"
  recovery_window_in_days = 0

  tags = {
    Name = "${local.name_prefix}-api-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "api" {
  secret_id = aws_secretsmanager_secret.api.id

  secret_string = jsonencode({
    DATABASE_URL         = local.database_url
    JWT_SECRET           = var.jwt_secret
    TOKEN_ENCRYPTION_KEY = var.token_encryption_key
    TIKTOK_CLIENT_KEY    = var.tiktok_client_key
    TIKTOK_CLIENT_SECRET = var.tiktok_client_secret
    TIKTOK_REDIRECT_URI  = local.tiktok_redirect_uri
    CORS_ORIGIN          = local.cms_url
    WEB_APP_URL          = local.cms_url
    AWS_REGION           = var.aws_region
    S3_BUCKET            = aws_s3_bucket.assets.id
    S3_KEY_PREFIX        = "assets"
    S3_PUBLIC_BASE_URL   = local.s3_public_base_url
  })
}
