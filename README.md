# Orion Slack Agent

AI-powered Slack assistant built with Claude Agent SDK.

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
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
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

## License

Private - All rights reserved

