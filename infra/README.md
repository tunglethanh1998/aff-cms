# Aff CMS — AWS Terraform (ECS Fargate + RDS)

Deploys:

| Resource | Hostname / note |
|----------|-----------------|
| Next.js Web | `https://cms.lethanhtung.click` |
| NestJS API | `https://api.lethanhtung.click` |
| Assets CDN | `https://cdn.lethanhtung.click` |
| Postgres | RDS private (not public) |

Region default: `ap-southeast-1`.

## Prerequisites

- AWS account + credentials (`aws configure` or env keys)
- Domain `lethanhtung.click` hosted zone in Route 53 (NS delegated)
- Terraform >= 1.5
- Docker
- Node 20+ (for local seed if needed)

```bash
# Find hosted zone ID
aws route53 list-hosted-zones-by-name --dns-name lethanhtung.click \
  --query 'HostedZones[0].Id' --output text
```

## 1. Configure variables

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set route53_zone_id, db_password, jwt_secret,
# token_encryption_key (64 hex chars), TikTok keys
```

Generate secrets:

```bash
openssl rand -hex 32   # jwt_secret (example)
openssl rand -hex 32   # token_encryption_key (must be 64 hex chars)
```

## 2. Bootstrap (ECR first, then images, then full stack)

ECS tasks need images in ECR before the services become healthy. Use a two-step apply:

```bash
cd infra
terraform init

# Create network + ECR (+ anything not depending on images is fine;
# targeting ECR + VPC pieces keeps the first pass small)
terraform apply \
  -target=aws_ecr_repository.api \
  -target=aws_ecr_repository.web \
  -target=aws_cloudwatch_log_group.api \
  -target=aws_cloudwatch_log_group.web

# Optional: create the rest of infra EXCEPT you still need images before
# ECS tasks stay healthy. Push placeholder images next.
```

Build & push images **once ECR exists**. If the full stack is not applied yet, set URLs manually:

```bash
# After ECR targets exist:
export AWS_REGION=ap-southeast-1
API_REPO=$(terraform output -raw ecr_api_repository_url)
WEB_REPO=$(terraform output -raw ecr_web_repository_url)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Temporary API URL for first web build (rebuild after full apply if needed)
docker build -f ../apps/api/Dockerfile -t "${API_REPO}:latest" ..
docker build -f ../apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.lethanhtung.click \
  -t "${WEB_REPO}:latest" ..
docker push "${API_REPO}:latest"
docker push "${WEB_REPO}:latest"
```

Then apply the full stack:

```bash
terraform apply
```

## 3. Ongoing deploys

From repo root (after `terraform apply` once):

```bash
./scripts/deploy-images.sh
# or
TAG=$(git rev-parse --short HEAD) ./scripts/deploy-images.sh
```

## 4. Seed admin user (one-time)

API container runs `prisma migrate deploy` on start. Seed once:

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
SERVICE=$(terraform output -raw ecs_api_service_name)
REGION=$(terraform output -raw aws_region)

TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" \
  --desired-status RUNNING --region "$REGION" \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster "$CLUSTER" \
  --task "$TASK_ARN" \
  --container api \
  --interactive \
  --command "/bin/sh" \
  --region "$REGION"

# Inside the container:
#   ADMIN_EMAIL=admin@lethanhtung.click ADMIN_PASSWORD='...' npx prisma db seed
```

If `execute-command` fails, enable it (already set on the service) and ensure the task has SSM permissions (included in Terraform). Wait for a fresh task after apply.

## 5. TikTok Developer Portal

Set Redirect URI **exactly**:

```text
https://api.lethanhtung.click/tiktok/oauth/callback
```

Must match App Info + Login Kit + `TIKTOK_REDIRECT_URI` (injected from Secrets Manager via Terraform).

## 6. Smoke test

1. Open `https://cms.lethanhtung.click` → login
2. `https://api.lethanhtung.click/health` → `{ "status": "ok", ... }`
3. Connect TikTok → authorize → land on `/accounts`
4. Upload an asset under **Assets**

## Useful outputs

```bash
terraform output cms_url
terraform output api_url
terraform output tiktok_redirect_uri
terraform output s3_public_base_url
terraform output ecr_api_repository_url
```

## Architecture notes

- ECS tasks run in **public subnets** with public IPs (no NAT Gateway cost); RDS stays in **private** subnets.
- ALB idle timeout = **300s** for large video uploads.
- API task memory = **2 GB** (draft upload up to 512 MB in memory).
- S3 access uses the **ECS task IAM role** (no static AWS keys in the container).
- TikTok OAuth `state` is stored in Postgres (`oauth_states`) so multiple API tasks work.

## Destroy

```bash
terraform destroy
```

Empty / force-delete ECR and `skip_final_snapshot` on RDS are enabled for easier teardown in this stack — tighten for long-lived production if needed.
