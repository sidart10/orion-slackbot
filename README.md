# Orion Slack Agent

AI-powered Slack assistant built with Claude Agent SDK.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Slack workspace with bot configured
- Anthropic API key
- Langfuse account (for observability)
- Vercel Pro account (required for 60s function timeout)

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
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
| `pnpm lint` | Check for linting errors |
| `pnpm lint:fix` | Auto-fix linting errors |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Type-check without emitting |

## Project Structure

```
orion-slack-agent/
├── api/                 # Vercel serverless functions
│   ├── health.ts        # Health check endpoint
│   └── slack.ts         # Slack webhook handler
├── src/                 # Source code (compiles to dist/)
│   ├── index.ts         # Entry point
│   ├── instrumentation.ts # OpenTelemetry setup
│   ├── config/          # Configuration
│   ├── agent/           # Agent implementation
│   ├── slack/           # Slack integration
│   └── tools/           # MCP tools
├── orion-context/       # Persistent context storage
│   ├── conversations/   # Conversation history
│   ├── user-preferences/# User settings
│   └── knowledge/       # Knowledge base
├── dist/                # Compiled TypeScript output
└── vercel.json          # Vercel configuration
```

## Environment Variables

See `.env.example` for all configuration options.

### Required Variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret |
| `ANTHROPIC_API_KEY` | Anthropic API Key (sk-ant-...) |
| `LANGFUSE_PUBLIC_KEY` | Langfuse Public Key |
| `LANGFUSE_SECRET_KEY` | Langfuse Secret Key |
| `LANGFUSE_BASEURL` | Langfuse Base URL |

## Deployment

### Vercel Deployment

Orion deploys to Vercel's serverless platform with Pro plan features.

#### Prerequisites

1. **Vercel Pro account** (required for 60s function timeout)
2. **Vercel CLI** installed: `npm i -g vercel`

#### Step 1: Link Project

```bash
# Link to Vercel (creates .vercel/ directory)
vercel link

# Pull environment variables to local
vercel env pull
```

#### Step 2: Configure Environment Variables

In the Vercel dashboard, add these environment variables:
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `ANTHROPIC_API_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASEURL`

#### Step 3: Deploy

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

#### Step 4: Configure Slack App

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Select your app
3. Navigate to **Event Subscriptions**
4. Enable Events
5. Set Request URL: `https://YOUR_VERCEL_URL/slack/events`
6. Subscribe to bot events:
   - `assistant_thread_started`
   - `assistant_thread_context_changed`
   - `message.im`
   - `message.channels`
7. Save changes

### Vercel Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Memory | 1024 MB | Sufficient for Node.js + Claude SDK |
| Max Duration | 60s | Pro plan timeout for agent loops |
| Framework | None | Custom TypeScript build |

### Local Development with Vercel

> **Note:** `vercel dev` has limitations with API-only projects (may exit after build). Use `pnpm dev` for local development, or deploy to preview for testing.

```bash
# Option 1: Use pnpm dev for local development
pnpm dev

# Option 2: Deploy to preview and test
vercel

# Test health endpoint (after deployment)
curl https://YOUR_PREVIEW_URL/health
```

## Development

This project uses:
- **TypeScript** for type safety
- **Vitest** for testing
- **ESLint + Prettier** for code quality
- **Langfuse** for observability
- **Vercel** for serverless deployment

## License

Private - All rights reserved
