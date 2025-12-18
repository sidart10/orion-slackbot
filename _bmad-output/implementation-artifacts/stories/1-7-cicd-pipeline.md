# Story 1.7: CI/CD Pipeline

Status: ready-for-dev

## Story

As a **developer**,
I want automated testing and deployment,
So that code changes are validated and deployed consistently.

## Acceptance Criteria

1. **Given** the Docker deployment is configured, **When** I push a PR to GitHub, **Then** GitHub Actions runs lint and test checks

2. **Given** lint and tests pass, **When** a PR is merged to main, **Then** Cloud Build triggers

3. **Given** Cloud Build is triggered, **When** the build succeeds, **Then** the new revision deploys to Cloud Run

4. **Given** deployment is configured, **When** I want different environments, **Then** environment tags (staging, production) are supported via `--tag`

## Tasks / Subtasks

- [ ] **Task 1: Create GitHub Actions CI Workflow** (AC: #1)
  - [ ] Create `.github/workflows/ci.yml`
  - [ ] Configure trigger on `pull_request` to `main`
  - [ ] Set up Node.js 20 with pnpm
  - [ ] Run `pnpm install --frozen-lockfile`
  - [ ] Run `pnpm lint` step
  - [ ] Run `pnpm typecheck` step
  - [ ] Run `pnpm test` step
  - [ ] Cache pnpm store for faster builds

- [ ] **Task 2: Create Cloud Build Configuration** (AC: #2, #3)
  - [ ] Create `cloudbuild.yaml` at project root
  - [ ] Configure Docker build step
  - [ ] Configure push to Artifact Registry
  - [ ] Configure Cloud Run deploy step
  - [ ] Set substitution variables for project/region
  - [ ] Add timeout configuration

- [ ] **Task 3: Create GitHub Actions Deploy Workflow** (AC: #2, #3, #4)
  - [ ] Create `.github/workflows/deploy.yml`
  - [ ] Configure trigger on push to `main`
  - [ ] Authenticate with GCP using Workload Identity
  - [ ] Trigger Cloud Build
  - [ ] Support environment tagging (staging/production)

- [ ] **Task 4: Configure Workload Identity Federation** (AC: #2)
  - [ ] Document GCP Workload Identity Pool setup
  - [ ] Document Service Account configuration
  - [ ] Configure GitHub repository secrets:
    - `GCP_PROJECT_ID`
    - `GCP_REGION`
    - `WORKLOAD_IDENTITY_PROVIDER`
    - `SERVICE_ACCOUNT`

- [ ] **Task 5: Add Environment Tagging Support** (AC: #4)
  - [ ] Add `--tag staging` support in Cloud Build
  - [ ] Add `--tag production` support in Cloud Build
  - [ ] Document manual promotion workflow
  - [ ] Add workflow_dispatch for manual deploys

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Create a test PR and verify CI runs
  - [ ] Verify lint errors fail the build
  - [ ] Verify test failures fail the build
  - [ ] Merge PR and verify Cloud Build triggers
  - [ ] Verify Cloud Run revision deploys
  - [ ] Test environment tagging with staging

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR34 | epics.md | GitHub Actions for CI (test + lint on PR) |
| AR35 | epics.md | Cloud Build for deployment trigger |
| AR36 | epics.md | Environment tags for staging/production (`--tag staging`) |

### Deployment Pipeline Flow

```
1. PR → GitHub Actions (lint + test)
2. Merge → GitHub Actions → Cloud Build trigger
3. Cloud Build → Docker image → Artifact Registry
4. Cloud Build → Deploy → Cloud Run (revision tag)
```

### .github/workflows/ci.yml

```yaml
name: CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run lint
        run: pnpm lint

      - name: Run type check
        run: pnpm typecheck

      - name: Run tests
        run: pnpm test
```

### .github/workflows/deploy.yml

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: ${{ secrets.GCP_REGION }}
  SERVICE_NAME: orion-slack-agent

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: ${{ env.PROJECT_ID }}

      - name: Determine environment tag
        id: env-tag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "tag=${{ inputs.environment }}" >> $GITHUB_OUTPUT
          else
            echo "tag=staging" >> $GITHUB_OUTPUT
          fi

      - name: Submit Cloud Build
        run: |
          gcloud builds submit \
            --config cloudbuild.yaml \
            --substitutions=_REGION=${{ env.REGION }},_TAG=${{ steps.env-tag.outputs.tag }}
```

### cloudbuild.yaml

```yaml
# Cloud Build configuration for Orion Slack Agent
# Substitutions:
#   _REGION: GCP region (e.g., us-central1)
#   _TAG: Environment tag (staging, production)

timeout: '600s'  # 10 minutes

steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-f'
      - 'docker/Dockerfile'
      - '-t'
      - 'gcr.io/$PROJECT_ID/orion-slack-agent:$COMMIT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/orion-slack-agent:${_TAG}'
      - '.'

  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '--all-tags'
      - 'gcr.io/$PROJECT_ID/orion-slack-agent'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'orion-slack-agent'
      - '--image'
      - 'gcr.io/$PROJECT_ID/orion-slack-agent:$COMMIT_SHA'
      - '--region'
      - '${_REGION}'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--min-instances'
      - '1'
      - '--max-instances'
      - '10'
      - '--memory'
      - '512Mi'
      - '--cpu'
      - '1'
      - '--timeout'
      - '240'
      - '--set-secrets'
      - 'SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,LANGFUSE_PUBLIC_KEY=langfuse-public-key:latest,LANGFUSE_SECRET_KEY=langfuse-secret-key:latest'
      - '--tag'
      - '${_TAG}'

substitutions:
  _REGION: 'us-central1'
  _TAG: 'staging'

images:
  - 'gcr.io/$PROJECT_ID/orion-slack-agent:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/orion-slack-agent:${_TAG}'
```

### GCP Workload Identity Setup

```bash
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

# 3. Create Service Account
gcloud iam service-accounts create "github-actions-deploy" \
  --display-name="GitHub Actions Deploy"

# 4. Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# 5. Allow GitHub to impersonate service account
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_ORG/orion-slack-agent" \
  --role="roles/iam.workloadIdentityUser"
```

### GitHub Repository Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `GCP_PROJECT_ID` | GCP project ID | `my-project-123` |
| `GCP_REGION` | Cloud Run region | `us-central1` |
| `WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider | `projects/123/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `SERVICE_ACCOUNT` | Deploy service account | `github-actions-deploy@my-project.iam.gserviceaccount.com` |

### Environment Tagging Workflow

```
# Automatic staging deploy on merge to main
main branch → staging tag

# Manual production promotion
workflow_dispatch → select "production" → production tag
```

Access deployments:
- Staging: `https://staging---orion-slack-agent-xxx.run.app`
- Production: `https://production---orion-slack-agent-xxx.run.app`

### File Structure After This Story

```
orion-slack-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Test + lint on PR
│       └── deploy.yml             # Cloud Build trigger
├── cloudbuild.yaml                # Cloud Build configuration
├── docker/
│   └── Dockerfile
├── ...
```

### References

- [Source: _bmad-output/epics.md#Story 1.7: CI/CD Pipeline] — Original story definition
- [Source: _bmad-output/architecture.md#Infrastructure & Deployment] — CI/CD decisions
- [External: GitHub Actions Setup](https://docs.github.com/en/actions)
- [External: Cloud Build Documentation](https://cloud.google.com/build/docs)
- [External: Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)

### Previous Story Intelligence

From Story 1-6 (Docker & Cloud Run):
- Dockerfile already created in `docker/Dockerfile`
- `scripts/deploy.sh` provides manual deployment alternative
- Secret Manager secrets already documented

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Workload Identity Federation is preferred over service account keys (no secrets to manage)
- CI workflow should run on every PR to catch issues early
- Deploy workflow only triggers on merge to main (not PRs)
- `--allow-unauthenticated` is needed for Slack webhooks
- Consider adding branch protection rules requiring CI to pass

### File List

Files to create:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `cloudbuild.yaml`

Files to modify:
- `README.md` (add CI/CD documentation)

