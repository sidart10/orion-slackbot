# Orion Slack Agent

An AI assistant that lives in Slack, powered by Claude. Orion maintains persistent memory across conversations, executes custom Skills, and integrates with external tools via MCP (Model Context Protocol).

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Development](#development)
- [Docker](#docker)
- [Deployment](#deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Streaming Responses** — Real-time typing with sub-second first token
- **Persistent Memory** — Per-user and per-thread context stored in GCS
- **Custom Skills** — Extensible skill system with Python execution support
- **MCP Integration** — Connect to external tools (Rube, Serena, custom servers)
- **Code Execution** — Python execution via Anthropic Skills API + Files API (GKE fallback for edge cases)
- **Full Observability** — Distributed tracing via Langfuse
- **Native Slack AI** — Uses Slack's Assistant API for thread management

## How It Works

Orion operates in a **three-phase loop**:

1. **Gather** — Collects relevant context from thread history and memory files
2. **Act** — Calls Claude API with available tools, executes tool calls in a bounded loop
3. **Verify** — Validates response quality and Slack formatting, retries if needed

Each phase is observable via Langfuse traces.

## Architecture

Orion is built on:
- **Slack Bolt (HTTP mode)** with Assistant API integration
- **Anthropic Messages API** with Skills + PTC (Programmatic Tool Calling)
- **MCP (Model Context Protocol)** for extensible tool connectivity
- **Langfuse** for observability and prompt management
- **Google Cloud Storage** for persistent memory
- **Cloud Run** for serverless deployment

### Code Execution

- **Primary:** Anthropic Skills API + Files API (zero infrastructure)
- **Fallback:** GKE Agent Sandbox (edge cases only: Playwright, local filesystem)

See [`_bmad-output/architecture.md`](_bmad-output/architecture.md) for detailed architecture decisions.

### Skills System

Orion uses Anthropic's Skills API for custom code execution capabilities:

**Skill Definition:**
- Create `.skills/<skill-name>/SKILL.md` with metadata + instructions
- Optional: Add `scripts/` directory with Python executables

**Skill Upload (Startup):**
- `initializeSkills()` scans `.skills/` and uploads to Anthropic Skills API
- Skills are cached by `skill_id` for runtime reference

**Skill Execution:**
- Skills pre-loaded in managed container via `container: { skills: [...] }`
- Container reused across conversation turns (30min TTL)
- Generated files downloadable via Files API

**Fallback:** GKE sandbox for edge cases (Playwright, local filesystem)

See [`.skills/` directory](/.skills/) for examples.

```mermaid
flowchart TB
    subgraph Slack["Slack"]
        User[User Message]
        Thread[Thread Response]
    end

    subgraph Entry["Entry Layer"]
        Bolt[Slack Bolt App]
        Assistant[Assistant Handler]
    end

    subgraph Agent["Agent Core (3 Phases)"]
        direction TB
        Gather[1. GATHER<br/>Context + Memory]
        Act[2. ACT<br/>Claude API + Tools]
        Verify[3. VERIFY<br/>Quality Check]
    end

    subgraph Tools["Tool System"]
        Registry[Tool Registry]
        Static[Static Tools<br/>summarize, orion_sandbox]
        Skills[Skill Tools<br/>.skills/*]
        MCP[MCP Tools<br/>rube, serena, etc.]
    end

    subgraph External["External Services"]
        Claude[Anthropic Claude API]
        GCS[GCS Memory Bucket]
        Sandbox[GKE Agent Sandbox]
        MCPServers[MCP Servers]
        Langfuse[Langfuse Observability]
    end

    User --> Bolt
    Bolt --> Assistant
    Assistant --> Gather
    Gather --> Act
    Act --> Verify
    Verify -->|retry| Act
    Verify --> Thread

    Gather -.-> GCS
    Act <--> Claude
    Act --> Registry
    Registry --> Static
    Registry --> Skills
    Registry --> MCP

    Static --> Sandbox
    MCP --> MCPServers

    Agent -.-> Langfuse
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Slack workspace with bot configured
- Anthropic API key
- Langfuse account (for observability)

**Optional (for GKE fallback only):**
- GCP project with GKE cluster (only required for edge-case skills: Playwright, local filesystem)

## Tech Stack

| Core | Version | Notes |
|------|---------|-------|
| TypeScript | 5.7.2 | Strict mode, ES2022 target |
| Node.js | ≥20.0.0 | ESM with `.js` imports |
| pnpm | 9.15.0 | Package manager |
| @anthropic-ai/sdk | ^0.72.x | Skills + Files API + PTC support |
| @slack/bolt | 4.6.0 | HTTP mode, Assistant API |
| langfuse | 3.38.6 | Tracing + prompt management |
| @google-cloud/storage | ^7.x | Memory persistence |

### Required Beta Headers

```typescript
betas: [
  'context-management-2025-06-27',  // Memory auto-context
  'advanced-tool-use-2025-11-20',   // PTC
  'code-execution-2025-08-25',      // Skills execution
  'skills-2025-10-02',              // Skills API CRUD
  'files-api-2025-04-14',           // File downloads
]
```

All betas consolidated in `config.anthropic.allBetas`.

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

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token starting with `xoxb-` |
| `SLACK_SIGNING_SECRET` | Request signature validation |
| `ANTHROPIC_API_KEY` | Claude API key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_APP_TOKEN` | — | Socket mode token (`xapp-`), for local dev |
| `LANGFUSE_PUBLIC_KEY` | — | Observability public key |
| `LANGFUSE_SECRET_KEY` | — | Observability secret key |
| `LANGFUSE_BASEURL` | `https://cloud.langfuse.com` | Langfuse endpoint |
| `PORT` | `3000` | HTTP server port |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `NODE_ENV` | `development` | Environment mode |

### GKE Sandbox (Code Execution)

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GKE_CLUSTER_NAME` | Cluster name (e.g., `orion-sandbox-cluster`) |
| `GKE_CLUSTER_REGION` | Cluster region (e.g., `us-central1`) |
| `GKE_SANDBOX_ROUTER_URL` | Sandbox router URL (local: `http://localhost:8080`) |

**Note:** GKE Sandbox variables are OPTIONAL. Most code execution uses Anthropic's managed container via Skills API + PTC. GKE is retained as fallback for edge cases (Playwright, local filesystem) only.

See: [infra/gke-sandbox/README.md](infra/gke-sandbox/README.md) for GKE setup details.

See `.env.example` for a complete template.

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
├── src/                      # Application source code
│   ├── index.ts              # Entry point (instrumentation first!)
│   ├── instrumentation.ts    # OpenTelemetry + Langfuse setup
│   ├── agent/                # Agent core loop
│   │   ├── orion.ts          # Main orchestrator (runOrionAgent)
│   │   ├── loop.ts           # ACT phase - Claude API + tool loop
│   │   ├── gather.ts         # GATHER phase - context + memory
│   │   └── verify.ts         # VERIFY phase - quality checks
│   ├── slack/                # Slack integration
│   │   ├── app.ts            # Bolt app setup (HTTP/Socket)
│   │   ├── assistant.ts      # Native Slack AI Assistant
│   │   ├── handlers/         # Event handlers
│   │   ├── prompts/          # System prompts
│   │   └── utils/            # Slack-specific utilities
│   ├── tools/                # Tool implementations
│   │   ├── index.ts          # Registry + executor
│   │   ├── mcp/              # MCP client + schema conversion
│   │   ├── orion-sandbox/    # GKE sandbox execution
│   │   ├── summarize/        # Thread summarization
│   │   └── memory/           # SDK memory helper
│   ├── skills/               # Skills system
│   │   ├── loader.ts         # Discovers .skills/*
│   │   ├── parser.ts         # SKILL.md parser
│   │   └── prompt-builder.ts # Injects skill hints
│   ├── config/               # Configuration
│   ├── memory/               # Memory path utilities
│   ├── observability/        # Langfuse + tracing
│   └── utils/                # Shared utilities
│
├── .orion/                   # Agent configuration
│   ├── config.yaml           # MCP servers, model settings
│   ├── agents/               # Agent personas (orion.md)
│   ├── workflows/            # Workflow definitions
│   └── tasks/                # Task definitions
│
├── .skills/                  # Skill definitions
│   ├── summarize/            # Thread summarization skill
│   ├── pdf/                  # PDF generation
│   ├── docx/                 # Word document generation
│   ├── xlsx/                 # Excel generation
│   └── ...                   # Additional skills
│
├── orion-context/            # Local persistent memory
│   ├── conversations/        # Thread summaries
│   ├── user-preferences/     # User settings
│   └── knowledge/            # Domain knowledge
│
├── infra/                    # Infrastructure configs
│   └── gke-sandbox/          # GKE Agent Sandbox manifests
│
├── scripts/                  # Deployment & utility scripts
├── docker/                   # Docker configuration
├── docs/                     # Documentation
└── tests/                    # Test suites
```

## Documentation

### For Developers

- **[`_bmad-output/project-context.md`](_bmad-output/project-context.md)** — Critical implementation rules and patterns that AI agents must follow
- **[`_bmad-output/architecture.md`](_bmad-output/architecture.md)** — Detailed architecture decisions and ADRs
- **[`docs/testing-standards.md`](docs/testing-standards.md)** — Testing best practices

### For Reference

- [Anthropic Skills API](docs/anthropic-sdk/using-skills-with-api.md)
- [MCP Integration](docs/mcp-config-implementation-2025-12-31.md)

## Development

This project uses:

- **TypeScript 5.7** with strict mode
- **Vitest** for testing
- **ESLint + Prettier** for code quality
- **Langfuse** for observability

### Local Development with GKE Sandbox

To enable code execution locally:

```bash
# Terminal 1: Start the sandbox tunnel (auto-restarts on disconnect)
./scripts/dev-sandbox-tunnel.sh

# Terminal 2: Start the dev server
pnpm dev
```

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

## Deployment

### Cloud Run (Recommended)

#### Prerequisites

1. Install and authenticate [gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. Set your project: `gcloud config set project YOUR_PROJECT_ID`
3. Enable required APIs:

```bash
gcloud services enable run.googleapis.com secretmanager.googleapis.com containerregistry.googleapis.com
```

#### Create Secrets

```bash
echo -n "xoxb-your-bot-token" | gcloud secrets create slack-bot-token --data-file=-
echo -n "your-signing-secret" | gcloud secrets create slack-signing-secret --data-file=-
echo -n "sk-ant-your-api-key" | gcloud secrets create anthropic-api-key --data-file=-
echo -n "pk-lf-your-public-key" | gcloud secrets create langfuse-public-key --data-file=-
echo -n "sk-lf-your-secret-key" | gcloud secrets create langfuse-secret-key --data-file=-
```

#### Grant Access

```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

for SECRET in slack-bot-token slack-signing-secret anthropic-api-key langfuse-public-key langfuse-secret-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

#### Deploy

```bash
./scripts/deploy.sh [staging|production]
```

### Configure Slack App

After deploying:

1. Go to [Slack App Settings](https://api.slack.com/apps)
2. Navigate to **Event Subscriptions** → Enable Events
3. Set Request URL: `https://YOUR_CLOUD_RUN_URL/slack/events`
4. Subscribe to bot events:
   - `assistant_thread_started`
   - `assistant_thread_context_changed`
   - `message.im`
   - `message.channels`
5. Save changes

### Verify Deployment

```bash
curl https://YOUR_CLOUD_RUN_URL/health
gcloud run logs read orion-slack-agent --region us-central1
```

## CI/CD Pipeline

### GitHub Actions Workflows

| Trigger | Action |
|---------|--------|
| PR to main | Run lint, typecheck, tests |
| Push to main | Deploy to staging |
| Manual dispatch | Deploy to staging or production |

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_REGION` | Cloud Run region |
| `WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider path |
| `SERVICE_ACCOUNT` | Deploy service account email |

### GCP Workload Identity Setup

<details>
<summary>Click to expand setup instructions</summary>

```bash
export PROJECT_ID=your-project-id
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export GITHUB_ORG=your-github-org
export REPO_NAME=orion-slack-agent

# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create Service Account
gcloud iam service-accounts create "github-actions-deploy" \
  --display-name="GitHub Actions Deploy"

# Grant permissions
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$ROLE"
done

# Allow GitHub to impersonate
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$GITHUB_ORG/$REPO_NAME" \
  --role="roles/iam.workloadIdentityUser"

# Get values for GitHub secrets
echo "WORKLOAD_IDENTITY_PROVIDER: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
echo "SERVICE_ACCOUNT: github-actions-deploy@$PROJECT_ID.iam.gserviceaccount.com"
```

</details>

## Contributing

1. Create a feature branch from `main`
2. Make changes following existing code patterns
3. Run `pnpm lint && pnpm typecheck && pnpm test`
4. Submit a PR with clear description

## License

Private - All rights reserved
