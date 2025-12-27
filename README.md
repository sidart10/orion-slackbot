# Orion Slack Agent

AI-powered Slack assistant built with the Anthropic Messages API (streaming).

## Prerequisites

- Node.js 20+
- pnpm 9+
- Slack workspace with bot configured
- Anthropic API key
- Langfuse account (for observability)

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Then start development server
pnpm dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Compile TypeScript to dist/ |
| `pnpm start` | Run production build |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Check for linting errors |
| `pnpm lint:fix` | Auto-fix linting errors |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Type-check without emitting |

## Project Structure

```
orion-slack-agent/
├── .orion/              # Agent definitions (BMAD-inspired)
│   ├── config.yaml      # Agent configuration
│   ├── agents/          # Agent personas
│   ├── workflows/       # Workflow definitions
│   └── tasks/           # Task definitions
├── .claude/             # Claude SDK extensions
│   ├── skills/          # Skill definitions
│   └── commands/        # Command definitions
├── orion-context/       # Persistent context storage
│   ├── conversations/   # Conversation history
│   ├── user-preferences/# User settings
│   └── knowledge/       # Knowledge base
├── src/                 # Source code
│   ├── index.ts         # Entry point
│   ├── instrumentation.ts # OpenTelemetry setup
│   └── config/          # Configuration
└── docker/              # Docker configuration
```

## Environment Variables

See `.env.example` for all configuration options.

## Development

This project uses:
- **TypeScript** for type safety
- **Vitest** for testing
- **ESLint + Prettier** for code quality
- **Langfuse** for observability

## Docker

### Local Development

```bash
# Build and run with docker-compose
docker-compose up

# Verify health endpoint
curl http://localhost:3000/health
```

### Build Production Image

```bash
# Build the image
pnpm docker:build

# Or manually
docker build -f docker/Dockerfile -t orion-slack-agent .
```

## CI/CD Pipeline

### Automated Pipeline

The project uses GitHub Actions for CI and Cloud Build for CD:

| Trigger | Action |
|---------|--------|
| PR to main | Run lint, typecheck, tests |
| Push to main | Deploy to staging |
| Manual dispatch | Deploy to staging or production |

### GitHub Actions Workflows

- **CI (`.github/workflows/ci.yml`)**: Runs on every PR
  - Linting with ESLint
  - Type checking with TypeScript
  - Unit tests with Vitest

- **Deploy (`.github/workflows/deploy.yml`)**: Runs on merge to main
  - Authenticates with GCP using Workload Identity
  - Triggers Cloud Build
  - Supports environment tagging

### Required GitHub Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `GCP_PROJECT_ID` | GCP project ID | `my-project-123` |
| `GCP_REGION` | Cloud Run region | `us-central1` |
| `WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider | `projects/123/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `SERVICE_ACCOUNT` | Deploy service account | `github-actions-deploy@my-project.iam.gserviceaccount.com` |

### GCP Workload Identity Federation Setup

Workload Identity Federation allows GitHub Actions to authenticate with GCP without storing service account keys.

```bash
# Set your project variables
export PROJECT_ID=your-project-id
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export GITHUB_ORG=your-github-org
export REPO_NAME=orion-slack-agent

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 3. Create Service Account for deployments
gcloud iam service-accounts create "github-actions-deploy" \
  --display-name="GitHub Actions Deploy"

# 4. Grant required permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# 5. Allow GitHub to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$GITHUB_ORG/$REPO_NAME" \
  --role="roles/iam.workloadIdentityUser"

# 6. Get the Workload Identity Provider resource name (for GitHub secret)
echo "WORKLOAD_IDENTITY_PROVIDER:"
echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"

echo "SERVICE_ACCOUNT:"
echo "github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com"
```

### Environment Tagging

- **Automatic (merge to main)**: Deploys with `staging` tag
- **Manual dispatch**: Choose `staging` or `production`

Access deployments:
- Staging: `https://staging---orion-slack-agent-xxx.run.app`
- Production: `https://production---orion-slack-agent-xxx.run.app`

### Manual Deployment

For manual deployment without CI/CD:

```bash
./scripts/deploy.sh [staging|production]
```

---

## Cloud Run Deployment

### Prerequisites

1. Install and authenticate [gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. Set your project: `gcloud config set project YOUR_PROJECT_ID`
3. Enable required APIs:
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

### Create Secrets in GCP Secret Manager

```bash
# Create each secret (you'll be prompted to enter the value)
echo -n "xoxb-your-bot-token" | gcloud secrets create slack-bot-token --data-file=-
echo -n "your-signing-secret" | gcloud secrets create slack-signing-secret --data-file=-
echo -n "sk-ant-your-api-key" | gcloud secrets create anthropic-api-key --data-file=-
echo -n "claude-sonnet-4-20250514" | gcloud secrets create anthropic-model --data-file=-
echo -n "orion-memories" | gcloud secrets create gcs-memories-bucket --data-file=-
echo -n "pk-lf-your-public-key" | gcloud secrets create langfuse-public-key --data-file=-
echo -n "sk-lf-your-secret-key" | gcloud secrets create langfuse-secret-key --data-file=-
```

### Grant Cloud Run Access to Secrets

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

# Grant access to each secret
for SECRET in slack-bot-token slack-signing-secret anthropic-api-key anthropic-model gcs-memories-bucket langfuse-public-key langfuse-secret-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Deploy

```bash
# Set your project ID
export GCP_PROJECT_ID=your-project-id

# Deploy (optional: specify tag like 'staging' or 'production')
./scripts/deploy.sh

# Or with a specific tag
./scripts/deploy.sh production
```

### Configure Slack App

After deploying to Cloud Run:

1. Go to [Slack App Settings](https://api.slack.com/apps)
2. Navigate to **Event Subscriptions**
3. Enable Events
4. Set Request URL: `https://YOUR_CLOUD_RUN_URL/slack/events`
5. Subscribe to bot events:
   - `assistant_thread_started`
   - `assistant_thread_context_changed`
   - `message.im`
   - `message.channels`
6. Save changes

### Verify Deployment

```bash
# Check health endpoint
curl https://YOUR_CLOUD_RUN_URL/health

# View logs
gcloud run logs read orion-slack-agent --region us-central1
```

## License

Private - All rights reserved

