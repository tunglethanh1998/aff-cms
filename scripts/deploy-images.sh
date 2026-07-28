#!/usr/bin/env bash
set -euo pipefail

# Build & push API + Web images to ECR, then force new ECS deployments.
# Prerequisites: aws CLI, docker, terraform outputs available (or env overrides).
#
# Usage (from repo root):
#   ./scripts/deploy-images.sh
#   TAG=v1 ./scripts/deploy-images.sh
#   AWS_REGION=ap-southeast-1 ./scripts/deploy-images.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
TAG="${TAG:-latest}"
AWS_REGION="${AWS_REGION:-}"

if [[ -z "${AWS_REGION}" ]]; then
  AWS_REGION="$(cd "${INFRA_DIR}" && terraform output -raw aws_region 2>/dev/null || echo "ap-southeast-1")"
fi

API_REPO="$(cd "${INFRA_DIR}" && terraform output -raw ecr_api_repository_url)"
WEB_REPO="$(cd "${INFRA_DIR}" && terraform output -raw ecr_web_repository_url)"
CLUSTER="$(cd "${INFRA_DIR}" && terraform output -raw ecs_cluster_name)"
API_SERVICE="$(cd "${INFRA_DIR}" && terraform output -raw ecs_api_service_name)"
WEB_SERVICE="$(cd "${INFRA_DIR}" && terraform output -raw ecs_web_service_name)"
API_URL="$(cd "${INFRA_DIR}" && terraform output -raw api_url)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "==> Login to ECR ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "==> Build API -> ${API_REPO}:${TAG}"
docker build \
  -f "${ROOT_DIR}/apps/api/Dockerfile" \
  -t "${API_REPO}:${TAG}" \
  "${ROOT_DIR}"

echo "==> Build Web -> ${WEB_REPO}:${TAG} (NEXT_PUBLIC_API_URL=${API_URL})"
docker build \
  -f "${ROOT_DIR}/apps/web/Dockerfile" \
  --build-arg "NEXT_PUBLIC_API_URL=${API_URL}" \
  -t "${WEB_REPO}:${TAG}" \
  "${ROOT_DIR}"

echo "==> Push images"
docker push "${API_REPO}:${TAG}"
docker push "${WEB_REPO}:${TAG}"

echo "==> Force ECS redeploy"
aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${CLUSTER}" \
  --service "${API_SERVICE}" \
  --force-new-deployment \
  --query 'service.serviceName' \
  --output text

aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${CLUSTER}" \
  --service "${WEB_SERVICE}" \
  --force-new-deployment \
  --query 'service.serviceName' \
  --output text

echo "==> Done. Watch:"
echo "  aws ecs describe-services --cluster ${CLUSTER} --services ${API_SERVICE} ${WEB_SERVICE} --region ${AWS_REGION}"
echo "  CMS: $(cd "${INFRA_DIR}" && terraform output -raw cms_url)"
echo "  API: ${API_URL}"
