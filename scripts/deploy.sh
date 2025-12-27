#!/bin/bash
# Deployment script for Orion Slack Agent to Google Cloud Run
#
# Usage:
#   ./scripts/deploy.sh [tag]
#
# Examples:
#   ./scripts/deploy.sh              # Deploy with 'latest' tag
#   ./scripts/deploy.sh staging      # Deploy with 'staging' tag
#   ./scripts/deploy.sh v1.0.0       # Deploy with version tag
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Docker installed
#   - Access to ai-workflows-459123 GCP project
#
# @see Story 1.6 - Docker & Cloud Run Deployment

set -e

# Configuration - aligned with existing Cloud Run service
PROJECT_ID="ai-workflows-459123"
REGION="us-central1"
SERVICE_NAME="orion-slack-agent"
REGISTRY="us-central1-docker.pkg.dev"
REPO="orion"
IMAGE_NAME="${REGISTRY}/${PROJECT_ID}/${REPO}/${SERVICE_NAME}"

# Tag (default: latest)
TAG="${1:-latest}"

echo "🔧 Configuration:"
echo "   Project ID: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo "   Image: ${IMAGE_NAME}:${TAG}"
echo ""

# Authenticate Docker with Artifact Registry
echo "🔐 Configuring Docker for Artifact Registry..."
gcloud auth configure-docker ${REGISTRY} --quiet

echo "🔨 Building Docker image for linux/amd64..."
docker build --platform linux/amd64 -f docker/Dockerfile -t "${IMAGE_NAME}:${TAG}" .

echo "📤 Pushing to Artifact Registry..."
docker push "${IMAGE_NAME}:${TAG}"

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}:${TAG}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 240 \
  --port 8080 \
  --set-env-vars="NODE_ENV=production,USE_E2B_SANDBOX=true" \
  --set-secrets="SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,ANTHROPIC_MODEL=anthropic-model:latest,GCS_MEMORIES_BUCKET=gcs-memories-bucket:latest,LANGFUSE_PUBLIC_KEY=langfuse-public-key:latest,LANGFUSE_SECRET_KEY=langfuse-secret-key:latest,E2B_API_KEY=e2b-api-key:latest"

echo ""
echo "✅ Deployment complete!"
echo "Service URL: https://orion-slack-agent-201626763325.us-central1.run.app"
echo ""
echo "📝 Slack Request URL: https://orion-slack-agent-201626763325.us-central1.run.app/slack/events"
echo "📝 Health endpoint: https://orion-slack-agent-201626763325.us-central1.run.app/health"
