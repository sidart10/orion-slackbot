# Story 1.6: Docker & Cloud Run Deployment

Status: ready-for-dev

## Story

As a **developer**,
I want to deploy Orion to Google Cloud Run,
So that the system is accessible to Slack in production.

## Acceptance Criteria

1. **Given** the application handles Slack events and streams responses, **When** deployment is triggered, **Then** a Docker image is built with the Dockerfile

2. **Given** the Docker image is being built, **When** the build completes, **Then** the image uses Node.js 20 LTS

3. **Given** the Docker image is built, **When** it runs, **Then** the app runs in HTTP mode (not socket mode) for Cloud Run

4. **Given** the app is deployed, **When** it starts, **Then** secrets are read from environment variables (GCP Secret Manager in production)

5. **Given** the Cloud Run service is configured, **When** deployment completes, **Then** min-instances is set to 1 to avoid cold starts (NFR13)

## Tasks / Subtasks

- [ ] **Task 1: Create Production Dockerfile** (AC: #1, #2)
  - [ ] Create `docker/Dockerfile` with multi-stage build
  - [ ] Use `node:20-alpine` as base image (LTS)
  - [ ] Install pnpm and dependencies in builder stage
  - [ ] Copy only production artifacts to runner stage
  - [ ] Include `.orion/`, `.claude/`, `orion-context/` directories
  - [ ] Set `NODE_ENV=production`
  - [ ] Expose port 3000

- [ ] **Task 2: Create docker-compose.yml for Local Development** (AC: #3)
  - [ ] Create `docker-compose.yml` at project root
  - [ ] Configure Orion service with volume mounts
  - [ ] Load environment from `.env` file
  - [ ] Enable hot reload for development
  - [ ] Add health check endpoint

- [ ] **Task 3: Configure HTTP Mode for Slack** (AC: #3)
  - [ ] Ensure `src/slack/app.ts` uses HTTP mode (not socket mode)
  - [ ] Configure request URL for Slack events
  - [ ] Set up `/slack/events` endpoint for webhook
  - [ ] Add `/health` endpoint for Cloud Run health checks

- [ ] **Task 4: Create Cloud Run Service Configuration** (AC: #4, #5)
  - [ ] Create `cloud-run-service.yaml` with Knative spec
  - [ ] Set `minScale: 1` for cold start mitigation (NFR13)
  - [ ] Set `maxScale: 10` for auto-scaling
  - [ ] Configure 4-minute request timeout (AR20)
  - [ ] Set memory limit (512Mi recommended)
  - [ ] Set CPU limit (1 vCPU recommended)
  - [ ] Configure concurrency settings

- [ ] **Task 5: Create Deployment Scripts** (AC: #1, #4)
  - [ ] Create `scripts/deploy.sh` for manual deployment
  - [ ] Include image build step
  - [ ] Include push to Artifact Registry
  - [ ] Include Cloud Run deploy command
  - [ ] Support environment tagging (staging, production)

- [ ] **Task 6: Document Secret Manager Setup** (AC: #4)
  - [ ] Add deployment section to README
  - [ ] Document required secrets:
    - `SLACK_BOT_TOKEN`
    - `SLACK_SIGNING_SECRET`
    - `ANTHROPIC_API_KEY`
    - `LANGFUSE_PUBLIC_KEY`
    - `LANGFUSE_SECRET_KEY`
  - [ ] Document `gcloud secrets create` commands
  - [ ] Document secret mounting in Cloud Run

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Build Docker image locally: `pnpm docker:build`
  - [ ] Run container locally: `docker-compose up`
  - [ ] Verify health endpoint responds: `curl http://localhost:3000/health`
  - [ ] Verify Slack app receives events via ngrok (local testing)
  - [ ] Deploy to Cloud Run staging
  - [ ] Verify min-instances = 1 in Cloud Console
  - [ ] Verify app responds to Slack in production

## Dev Notes

### HTTP Mode vs Socket Mode (CRITICAL)

| Mode | How It Works | Use Case |
|------|--------------|----------|
| Socket Mode | WebSocket connection | Local development, behind firewalls |
| HTTP Mode | Webhooks (POST requests) | **Production on Cloud Run** ✅ |

HTTP Mode is REQUIRED for Cloud Run because:
- Webhooks align naturally with serverless (stateless request/response)
- Socket Mode requires keeping instances warm
- Cloud Run treats WebSockets as long-running HTTP requests subject to timeouts

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR20 | architecture.md | 4 minute hard timeout (below Cloud Run default) |
| AR33 | architecture.md | Docker deployment to Google Cloud Run (HTTP mode) |
| NFR13 | epics.md | min-instances = 1 for cold start mitigation |
| NFR25 | epics.md | Cloud Run auto-scaling within budget |

### docker/Dockerfile (Production)

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build application
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

# Install pnpm for production deps
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy agent definitions and context directories
COPY --from=builder /app/.orion ./.orion
COPY --from=builder /app/.claude ./.claude
COPY --from=builder /app/orion-context ./orion-context

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

### docker-compose.yml (Local Development)

```yaml
version: '3.8'

services:
  orion:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=development
    volumes:
      # Mount source for hot reload (development only)
      - ./src:/app/src:ro
      - ./.orion:/app/.orion:ro
      - ./.claude:/app/.claude:ro
      - ./orion-context:/app/orion-context
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

### cloud-run-service.yaml

```yaml
# Cloud Run Service Configuration
# Apply with: gcloud run services replace cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: orion-slack-agent
  labels:
    app: orion
spec:
  template:
    metadata:
      annotations:
        # Cold start mitigation (NFR13)
        autoscaling.knative.dev/minScale: "1"
        # Auto-scaling limit (NFR25)
        autoscaling.knative.dev/maxScale: "10"
        # Request timeout (AR20 - 4 minutes, below Cloud Run default of 5)
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 80
      timeoutSeconds: 240  # 4 minutes
      containers:
        - image: gcr.io/PROJECT_ID/orion-slack-agent:latest
          ports:
            - containerPort: 3000
          resources:
            limits:
              memory: 512Mi
              cpu: "1"
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
          # Secrets from GCP Secret Manager
          # Configure via gcloud or Cloud Console
```

### scripts/deploy.sh

```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="orion-slack-agent"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Tag (default: latest, or pass staging/production)
TAG="${1:-latest}"

echo "🔨 Building Docker image..."
docker build -f docker/Dockerfile -t ${IMAGE_NAME}:${TAG} .

echo "📤 Pushing to Container Registry..."
docker push ${IMAGE_NAME}:${TAG}

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:${TAG} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 240 \
  --set-secrets=SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,LANGFUSE_PUBLIC_KEY=langfuse-public-key:latest,LANGFUSE_SECRET_KEY=langfuse-secret-key:latest \
  --tag ${TAG}

echo "✅ Deployment complete!"
echo "Service URL: $(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')"
```

### Health Endpoint (src/slack/app.ts Update)

```typescript
import { App, ExpressReceiver } from '@slack/bolt';
import { env } from '../config/environment.js';

// Create Express receiver for HTTP mode (Cloud Run)
const receiver = new ExpressReceiver({
  signingSecret: env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events',
});

// Add health check endpoint (required for Cloud Run)
receiver.router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
  });
});

// Create Bolt app in HTTP mode
export const app = new App({
  token: env.SLACK_BOT_TOKEN,
  receiver,
  // Note: No socketMode or appToken - we're using HTTP mode for Cloud Run
});
```

### GCP Secret Manager Setup

```bash
# Create secrets in GCP Secret Manager
gcloud secrets create slack-bot-token --data-file=-
gcloud secrets create slack-signing-secret --data-file=-
gcloud secrets create anthropic-api-key --data-file=-
gcloud secrets create langfuse-public-key --data-file=-
gcloud secrets create langfuse-secret-key --data-file=-

# Grant Cloud Run service account access
gcloud secrets add-iam-policy-binding slack-bot-token \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Expected Latency Profile

| Phase | Expected Latency |
|-------|------------------|
| Slack → Cloud Run | ~50-100ms |
| Cloud Run → Claude API | ~500-2000ms |
| MCP tool execution | Variable (100ms-5s) |
| Total (simple query) | ~1-3 seconds |
| Total (with MCP tools) | ~3-10 seconds |

### File Structure After This Story

```
orion-slack-agent/
├── docker/
│   └── Dockerfile               # Production Docker image
├── docker-compose.yml           # Local development
├── cloud-run-service.yaml       # Cloud Run configuration
├── scripts/
│   └── deploy.sh               # Deployment script
├── src/
│   ├── slack/
│   │   └── app.ts              # Updated with health endpoint
│   └── ...
└── ...
```

### Slack Configuration for HTTP Mode

After deploying to Cloud Run, configure your Slack app:

1. Go to https://api.slack.com/apps/YOUR_APP_ID
2. Navigate to "Event Subscriptions"
3. Enable Events
4. Set Request URL: `https://YOUR_CLOUD_RUN_URL/slack/events`
5. Subscribe to bot events:
   - `assistant_thread_started`
   - `assistant_thread_context_changed`
   - `message.im`
   - `message.channels`
6. Save changes

### References

- [Source: _bmad-output/epics.md#Story 1.6: Docker & Cloud Run Deployment] — Original story definition
- [Source: _bmad-output/architecture.md#Infrastructure & Deployment] — Deployment decisions
- [Source: technical-research#6. Cloud Deployment Strategy] — Cloud Run configuration
- [Source: technical-research#6.2 Socket Mode vs HTTP Mode] — HTTP mode rationale
- [External: Cloud Run Documentation](https://cloud.google.com/run/docs)
- [External: Cloud Run + Slack Bot Codelab](https://codelabs.developers.google.com/codelabs/cloud-slack-bot)

### Previous Story Intelligence

From Story 1-1 (Project Scaffolding):
- Basic Dockerfile template already created in `docker/Dockerfile`
- `pnpm docker:build` script configured in package.json
- Environment variable structure defined in `.env.example`

From Story 1-3 (Slack Bolt App Setup):
- `src/slack/app.ts` needs to be updated for HTTP mode
- Health check endpoint should be added

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Story 1-1 already includes a basic Dockerfile — this story extends it for Cloud Run specifics
- The `deploy.sh` script assumes GCP_PROJECT_ID and GCP_REGION are set
- Health endpoint is critical for Cloud Run readiness probes
- `--allow-unauthenticated` is needed since Slack sends unsigned health check requests
- Consider setting up Cloud Build for automated CI/CD (Story 1-7)

### File List

Files to create:
- `docker/Dockerfile` (may update existing from Story 1-1)
- `docker-compose.yml`
- `cloud-run-service.yaml`
- `scripts/deploy.sh`

Files to modify:
- `src/slack/app.ts` (add health endpoint, ensure HTTP mode)
- `README.md` (add deployment documentation)

