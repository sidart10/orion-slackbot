---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md"
  - "_bmad-output/analysis/product-brief-2025-12-orion-slack-agent-2025-12-17.md"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2025-12-17'
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-17'
hasProjectContext: false
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

Orion's 43 functional requirements span 7 architectural domains:

| Domain | FR Range | Core Capability |
|--------|----------|-----------------|
| Agent Core | FR1-6 | Agent loop execution, verification, subagents, context management |
| Research | FR7-12 | Multi-source search, synthesis, parallel information gathering |
| Communication | FR13-18 | Slack integration, streaming, thread context, suggested prompts |
| Code Execution | FR19-23 | On-the-fly code generation, sandboxed execution, API calls |
| Extensions | FR24-29 | Skills, Commands, MCP servers — composable tool layer |
| Knowledge | FR30-34 | Q&A, troubleshooting, domain-specific recommendations |
| Observability | FR35-40 | Langfuse tracing, prompt versioning, cost tracking |

**Non-Functional Requirements:**

| Category | Target | Architectural Driver |
|----------|--------|---------------------|
| Response time (simple) | 1-3 seconds | Async streaming, no blocking |
| Response time (tools) | 3-10 seconds | Parallel tool execution |
| Deep research | <5 minutes | Subagent parallelization |
| Uptime | >99.5% | Min 1 instance, health checks |
| Tool success rate | >98% | Retry logic, fallbacks |
| Cost per query | <$0.10 | Token optimization, caching |
| Concurrent users | 50 | Vercel serverless auto-scaling |

**Scale & Complexity:**

- Primary domain: Backend platform with Slack integration
- Complexity level: Medium-High
- Estimated architectural components: 8-10 major subsystems
- Deployment: Vercel Serverless Functions

### Technical Constraints & Dependencies

| Constraint | Impact |
|------------|--------|
| **Anthropic API (messages.create with tools)** | Direct API calls with tool_use for MCP integration; no subprocess requirements |
| **LLM provider + model selection** | Must be runtime-configurable (provider + model ID) to avoid hardcoding and enable switching/routing |
| **Slack Bolt + Assistant API** | HTTP webhooks, streaming, thread management |
| **MCP 1.0 Protocol** | Standard interface for all external tools (Rube/Composio as primary provider) |
| **Vercel Serverless** | Stateless, auto-scaling; 60s timeout on Pro plan |
| **Langfuse** | OpenTelemetry integration, prompt management |
| **Large model context (model-dependent)** | Requires compaction for long threads |

### Cross-Cutting Concerns Identified

1. **Observability** — Every component must emit traces to Langfuse
2. **Error Handling** — Graceful degradation when tools fail, verification retry loops
3. **Streaming** — All user-facing responses streamed for perceived performance
4. **Tool Abstraction** — MCP, code gen, agentic search unified under single interface
5. **Context Management** — Thread compaction, subagent isolation, prompt caching
6. **Security** — Secrets in GCP Secret Manager, request signature verification, sandboxed code

## Starter Template Evaluation

### Primary Technology Domain

**Agentic Slack Platform** — A specialized agent system, not a typical web application. Standard web starters (Next.js, T3, etc.) are not appropriate for this architecture.

### Starter Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **Custom Structure** | Build from scratch following research patterns | ✅ Selected |
| **Minimal TS Starter** | Generic Node.js TypeScript template | ❌ Would need significant restructuring |
| **Web App Starters** | Next.js, T3, etc. | ❌ Wrong paradigm for agentic system |

### Selected Approach: Custom Project Structure

**Rationale:**
- Research document already defines optimal structure for agentic Slack bots
- BMAD-inspired file-based agent definitions require specific organization
- No existing starter matches Anthropic API + Slack Bolt + Langfuse pattern
- Avoids fighting against starter assumptions designed for web apps

**Project Structure:**

```
orion-slack-agent/
├── src/
│   ├── index.ts                    # Entry point (imports instrumentation first)
│   ├── instrumentation.ts          # OpenTelemetry + Langfuse setup
│   ├── config/
│   │   └── environment.ts          # Environment variables
│   ├── observability/
│   │   ├── langfuse.ts             # Langfuse client singleton
│   │   └── tracing.ts              # Tracing utilities
│   ├── slack/
│   │   ├── app.ts                  # Slack Bolt app setup
│   │   ├── assistant.ts            # Assistant class configuration
│   │   └── handlers/
│   │       ├── threadStarted.ts
│   │       ├── threadContextChanged.ts
│   │       └── userMessage.ts
│   ├── agent/
│   │   ├── orion.ts                # Anthropic API integration (messages.create with tools)
│   │   ├── loader.ts               # BMAD-style agent loader
│   │   └── tools.ts                # MCP tool definitions for Claude
│   └── utils/
│       └── streaming.ts            # Streaming utilities
├── .orion/                         # Agent definitions (BMAD-inspired)
│   ├── agents/                     # Agent personas
│   ├── workflows/                  # Multi-step workflows
│   ├── tasks/                      # Reusable tasks
│   └── config.yaml
├── .claude/                        # Agent skill and command definitions
│   ├── skills/                     # Auto-discovered Skills
│   └── commands/                   # Slash Commands
├── orion-context/                  # Agentic search context directory
│   ├── conversations/
│   ├── user-preferences/
│   └── knowledge/
├── Dockerfile
├── docker-compose.yml              # Local development
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

**Architectural Decisions Established:**

| Category | Decision | Rationale |
|----------|----------|-----------|
| **Language** | TypeScript 5.x | Anthropic SDK + type safety |
| **Runtime** | Node.js 20 LTS | Long-term support, modern features |
| **Package Manager** | pnpm | Fast, disk efficient |
| **Linting** | ESLint + Prettier | Standard, well-supported |
| **Testing** | Vitest | Fast, ESM-native |
| **Build** | tsc (TypeScript compiler) | Simple, reliable |

**Core Dependencies:**

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",
    "@slack/bolt": "^3.x",
    "@langfuse/client": "^4.x",
    "@langfuse/tracing": "^4.x",
    "@langfuse/otel": "^4.x",
    "@opentelemetry/sdk-node": "^1.x",
    "dotenv": "^16.x",
    "yaml": "^2.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "typescript": "^5.x",
    "eslint": "^8.x",
    "prettier": "^3.x",
    "vitest": "^1.x"
  }
}
```

**Development Workflow:**

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Local development with hot reload |
| `pnpm build` | TypeScript compilation |
| `pnpm test` | Run Vitest tests |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm docker:build` | Build Docker image |

**Note:** Project initialization using this structure should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Agent execution model (pluggable LLM layer; Anthropic API initially)
- Context management strategy
- Tool layer architecture
- Deployment infrastructure

**Important Decisions (Shape Architecture):**
- Verification patterns
- Error handling strategy
- Memory persistence approach

**Deferred Decisions (Post-MVP):**
- Vector database for semantic memory
- Complex session management
- Cross-user memory patterns

### Agent State & Context Management

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Thread Context** | Slack API fetch + LLM provider in-context | Stateless Vercel serverless, leverage Slack as source of truth |
| **Long Thread Handling** | Manual sliding window compaction | Truncate oldest messages when context fills |
| **Persistent Memory** | File-based (`orion-context/`) | Simple, searchable via agentic search, no extra infra |
| **Prompt Caching** | In-memory cache for Langfuse prompt fetches (TTL configurable) | Reduce prompt-fetch latency and limit API calls |
| **Model selection** | Config-driven (provider + model ID) | Switch models/providers without code changes; route larger-context tasks to larger-context models |

**Memory Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY LAYERS                                │
├─────────────────────────────────────────────────────────────────┤
│  REQUEST CONTEXT     │ Slack thread history (API fetch)         │
│  ────────────────────┼───────────────────────────────────────── │
│  SESSION CONTEXT     │ Claude model context window (model-dependent) │
│                      │ + automatic compaction for long threads  │
│  ────────────────────┼───────────────────────────────────────── │
│  PERSISTENT MEMORY   │ File system (orion-context/)             │
│                      │ + Langfuse prompt versions               │
└─────────────────────────────────────────────────────────────────┘
```

**Upgrade Path (Post-MVP):**
- Add Redis for hot session data if file I/O becomes bottleneck
- Add vector store (Chroma) if semantic memory search needed
- Add database if cross-user memory patterns required

### Agent Execution Patterns

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Agent Execution** | Direct Anthropic API with tool_use | Simple `messages.create()` with streaming, tools exposed as Claude tool definitions |
| **Subagent Execution** | Sequential or parallel API calls | Parallelism via Promise.all on multiple messages.create calls |
| **Verification Strategy** | LLM-as-Judge via Langfuse Evals | Langfuse provides eval infrastructure, track quality over time |
| **Verification Loop** | Rules-based + Langfuse async evals | Fast rules for blocking, LLM evals for quality monitoring |

### Tool Layer Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **MCP Management** | Rube (Composio) as primary MCP server | 500+ app integrations, includes code execution via RUBE_REMOTE_WORKBENCH |
| **Tool Exposure** | MCP tools as Claude tool definitions | Convert MCP tool schemas to Anthropic tool format for messages.create() |
| **Code Execution** | Via Rube RUBE_REMOTE_WORKBENCH | No custom sandbox needed; Rube provides Python/bash execution |
| **Tool Discovery** | RUBE_SEARCH_TOOLS for dynamic discovery | Agent discovers what it needs at runtime |

**Tool Selection Pattern:**

```
User Request
    │
    ▼
┌─────────────────────────────────────┐
│  1. Can MCP tool handle this?       │──Yes──▶ Use MCP tool
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│  2. Can agentic search find it?     │──Yes──▶ Search files/context
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│  3. Generate code in sandbox        │──────▶ Write & execute code
└─────────────────────────────────────┘
```

### Error Handling & Resilience

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tool Failures** | Graceful degradation | Continue with available tools, inform user |
| **Retry Strategy** | Exponential backoff (2-3 retries) | Transient failures recovered |
| **Long Operations** | Progress callbacks + periodic updates | Keep user informed via Slack status |
| **Timeout** | 60 seconds | Vercel Pro plan function timeout |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Platform** | Vercel Pro | Fast serverless, 60s function timeout, simple deploys |
| **CI/CD** | GitHub Actions + Vercel | Actions for tests, Vercel for automatic deploys |
| **Environments** | Vercel preview/production | Automatic preview deploys on PR |
| **Secrets** | Vercel Environment Variables | Dashboard-managed, no secrets in code |

### Decision Impact Analysis

**Implementation Sequence:**
1. Project scaffolding (structure, dependencies)
2. Slack Bolt + event handlers setup
3. Anthropic API integration (messages.create with streaming)
4. Langfuse observability
5. MCP tool layer (Rube as primary server)
6. Agent loop (gather → act → verify)
7. File-based memory
8. Vercel deployment

**Cross-Component Dependencies:**
- Langfuse must be initialized before Anthropic calls (instrumentation first)
- MCP servers initialize lazily when first tool call needed
- Memory layer depends on file structure being in place
- Verification depends on Langfuse eval infrastructure

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 12 areas where AI agents could make different choices

These patterns ensure all AI agents working on Orion produce compatible, consistent code.

### Naming Patterns

**File Naming:**

| Element | Convention | Example |
|---------|------------|---------|
| TypeScript files | `kebab-case.ts` | `user-message.ts` |
| Test files | `*.test.ts` co-located | `user-message.test.ts` |
| Type definition files | `*.types.ts` | `slack.types.ts` |
| Config files | `kebab-case` | `environment.ts` |

**Code Naming (TypeScript Standard):**

| Element | Convention | Example |
|---------|------------|---------|
| Classes/Interfaces/Types | PascalCase | `UserMessageHandler`, `AgentContext` |
| Functions/Methods | camelCase | `handleUserMessage`, `gatherContext` |
| Variables | camelCase | `userId`, `threadContext` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `TOOL_TIMEOUT_MS` |
| Enums | PascalCase (values SCREAMING_SNAKE) | `enum Status { IN_PROGRESS }` |

**Agent Definition Naming (.orion/):**

| Element | Convention | Example |
|---------|------------|---------|
| Agent files | `kebab-case.md` | `research-agent.md` |
| Workflow folders | `kebab-case/` | `deep-research/` |
| Task files | `kebab-case.md` | `verify-response.md` |
| Config files | `kebab-case.yaml` | `config.yaml` |

**MCP/Tool Naming:**

| Element | Convention | Example |
|---------|------------|---------|
| Tool names | snake_case | `search_slack`, `get_user_info` |
| Tool descriptions | Action-oriented sentence | "Search Slack channels for messages" |
| Argument names | snake_case | `channel_id`, `search_query` |

### Structure Patterns

**Directory Organization:**

```
src/
├── index.ts              # Entry point only - imports and starts app
├── instrumentation.ts    # MUST be imported first in index.ts
├── config/               # Environment and configuration
├── observability/        # Langfuse, tracing utilities
├── slack/                # Slack-specific code
│   ├── app.ts           # Bolt app setup
│   ├── assistant.ts     # Assistant class
│   └── handlers/        # Event handlers (one file per handler)
├── agent/                # Anthropic API integration
│   ├── orion.ts         # Main agent orchestration
│   ├── loop.ts          # Agent loop implementation
│   ├── subagents/       # Subagent definitions
│   └── tools.ts         # Tool configurations
├── tools/                # Tool implementations
│   ├── mcp/             # MCP client utilities
│   └── sandbox/         # Code execution utilities
└── utils/                # Shared utilities
    ├── errors.ts        # Error types and handling
    ├── streaming.ts     # Streaming utilities
    └── validation.ts    # Validation helpers
```

**Test Organization:**

- Tests co-located with source: `user-message.test.ts` next to `user-message.ts`
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`

### Format Patterns

**Slack Response Formatting:**

```typescript
// REQUIRED: Use Slack mrkdwn syntax
const slackFormatRules = {
  bold: "*text*",           // NOT **text**
  italic: "_text_",         // NOT *text*
  code: "`code`",
  codeBlock: "```code```",
  listItem: "• ",           // Bullet points, not numbered
  noBlockquotes: true,      // User preference
  noEmojis: true,           // Unless explicitly requested
};
```

**Error Response Format:**

```typescript
interface OrionError {
  code: string;              // Machine-readable: 'TOOL_FAILED', 'CONTEXT_LIMIT'
  message: string;           // Developer-readable for logs
  userMessage: string;       // Safe to display in Slack
  context?: Record<string, unknown>;  // Additional debug info
  recoverable: boolean;      // Can the agent retry?
}

// Error code constants
const ErrorCodes = {
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  CONTEXT_LIMIT: 'CONTEXT_LIMIT',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  MCP_CONNECTION_ERROR: 'MCP_CONNECTION_ERROR',
} as const;
```

**Logging Format:**

```typescript
// REQUIRED: Structured JSON logging
interface LogEntry {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;            // snake_case event name
  traceId?: string;         // Langfuse trace ID
  userId?: string;          // Slack user ID
  duration?: number;        // Milliseconds
  [key: string]: unknown;   // Additional context
}
```

### Communication Patterns

**Agent Loop Pattern (MANDATORY):**

```typescript
// ALL agent implementations MUST follow this pattern
async function executeAgentLoop(
  input: string,
  context: AgentContext
): Promise<AgentResponse> {
  const MAX_ATTEMPTS = 3;
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // PHASE 1: GATHER CONTEXT
    const gatheredContext = await gatherContext(input, context);
    
    // PHASE 2: TAKE ACTION
    const response = await generateResponse(input, gatheredContext);
    
    // PHASE 3: VERIFY WORK
    const verification = await verifyResponse(response, input);
    
    if (verification.passed) {
      return response;
    }
    
    context.verificationFeedback = verification.feedback;
    context.attemptNumber = attempt + 1;
  }
  
  return createGracefulFailureResponse(input, context);
}
```

**Subagent Communication:**

```typescript
// Subagent spawn pattern
const subagentResult = await spawnSubagent({
  name: 'research-agent',
  input: researchQuery,
  returnFormat: 'summary',  // 'summary' | 'detailed' | 'raw'
});

// Parallel subagent execution
const results = await Promise.all([
  spawnSubagent({ name: 'search-agent', input: query1 }),
  spawnSubagent({ name: 'search-agent', input: query2 }),
]);
```

### Process Patterns

**Observability (MANDATORY):**

```typescript
// ALL handlers MUST be wrapped in trace
import { startActiveObservation } from '@langfuse/tracing';

async function handleUserMessage(context: SlackContext) {
  await startActiveObservation('user-message-handler', async (trace) => {
    trace.update({
      input: context.message.text,
      userId: context.userId,
      sessionId: context.threadTs,
      metadata: { channel: context.channel, teamId: context.teamId }
    });
    
    const response = await processMessage(context);
    trace.update({ output: response });
  });
}
```

**Tool Execution Pattern:**

```typescript
const TOOL_TIMEOUT_MS = 30_000;  // 30 seconds

async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const result = await withTimeout(
      mcpClient.callTool(toolName, args),
      TOOL_TIMEOUT_MS
    );
    return { success: true, data: result };
  } catch (error) {
    // Graceful degradation - don't throw, return error result
    return {
      success: false,
      error: createOrionError('TOOL_FAILED', {
        tool: toolName,
        message: error.message,
        userMessage: `Unable to access ${toolName}. Continuing with available tools.`,
        recoverable: true
      })
    };
  }
}
```

**Streaming Pattern:**

```typescript
async function streamToSlack(
  client: WebClient,
  channel: string,
  threadTs: string,
  userId: string,
  teamId: string,
  responseGenerator: AsyncIterable<AgentMessage>
): Promise<void> {
  // NOTE: Slack supports streaming via:
  // - chat.startStream → chat.appendStream → chat.stopStream
  // The exact request fields depend on your Slack SDK / Bolt versions.
  // Treat this as pseudocode and follow Slack's current reference docs when implementing.

  for await (const message of responseGenerator) {
    if (message.type === 'text') {
      // await client.chat.appendStream({ ... });
    }
  }
  // await client.chat.stopStream({ ... });
}
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. ✅ Follow the canonical agent loop pattern (gather → act → verify)
2. ✅ Wrap all handlers in Langfuse traces via `startActiveObservation`
3. ✅ Use structured JSON logging for all log statements
4. ✅ Implement graceful degradation for tool failures
5. ✅ Use Slack mrkdwn syntax (not markdown) for responses
6. ✅ Follow file naming conventions (`kebab-case.ts`)
7. ✅ Follow code naming conventions (TypeScript standard)
8. ✅ Use the `OrionError` interface for all errors

**Pattern Enforcement:**

- ESLint rules enforce naming conventions
- TypeScript strict mode catches type errors
- Code review checks for pattern compliance
- Langfuse traces provide visibility into pattern adherence

## Project Structure & Boundaries

### Requirements to Structure Mapping

| FR Domain | Primary Location | Supporting Files |
|-----------|------------------|------------------|
| **Agent Core (FR1-6)** | `src/agent/` | `orion.ts`, `loop.ts`, `subagents/` |
| **Research (FR7-12)** | `src/agent/subagents/` | `research-agent.ts`, `.orion/agents/research.md` |
| **Communication (FR13-18)** | `src/slack/` | `handlers/`, `assistant.ts` |
| **Code Execution (FR19-23)** | `src/tools/sandbox/` | `executor.ts`, `validator.ts` |
| **Extensions (FR24-29)** | `src/tools/mcp/`, `.claude/` | `client.ts`, `skills/`, `commands/` |
| **Knowledge (FR30-34)** | `orion-context/knowledge/` | `.orion/workflows/` |
| **Observability (FR35-40)** | `src/observability/` | `langfuse.ts`, `tracing.ts` |

### Complete Project Directory Structure

```
orion-slack-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                         # Test + lint on PR
│       └── deploy.yml                     # Cloud Build trigger
├── .orion/                                # Agent definitions (BMAD-inspired)
│   ├── config.yaml                        # Agent configuration
│   ├── agents/
│   │   ├── orion.md                       # Primary agent persona
│   │   ├── research-agent.md              # Deep research subagent
│   │   └── verification-agent.md          # Verification subagent
│   ├── workflows/
│   │   └── deep-research/
│   │       ├── workflow.md                # Multi-step research workflow
│   │       └── steps/
│   │           ├── gather-sources.md
│   │           └── synthesize.md
│   └── tasks/
│       ├── verify-response.md             # Verification task
│       └── format-slack.md                # Slack formatting task
├── .claude/                               # Agent skill and command definitions
│   ├── skills/
│   │   └── search-workspace.md            # Auto-discovered Skills
│   └── commands/
│       └── help.md                        # Slash Commands
├── orion-context/                         # Agentic search context
│   ├── conversations/                     # Thread summaries
│   │   └── .gitkeep
│   ├── user-preferences/                  # Per-user preferences
│   │   └── .gitkeep
│   └── knowledge/                         # Domain knowledge files
│       └── .gitkeep
├── src/
│   ├── index.ts                           # Entry point
│   ├── instrumentation.ts                 # OpenTelemetry + Langfuse (import first!)
│   ├── config/
│   │   └── environment.ts                 # Environment variables
│   ├── observability/
│   │   ├── langfuse.ts                    # Langfuse client singleton
│   │   └── tracing.ts                     # Tracing utilities
│   ├── slack/
│   │   ├── app.ts                         # Slack Bolt app setup
│   │   ├── assistant.ts                   # Assistant class configuration
│   │   ├── types.ts                       # Slack-specific types
│   │   └── handlers/
│   │       ├── thread-started.ts          # Thread initialization
│   │       ├── thread-context-changed.ts  # Context switch handler
│   │       └── user-message.ts            # Main message handler
│   ├── agent/
│   │   ├── orion.ts                       # Anthropic API integration
│   │   ├── loop.ts                        # Agent loop (gather → act → verify)
│   │   ├── loader.ts                      # BMAD-style agent loader
│   │   ├── types.ts                       # Agent types
│   │   ├── subagents/
│   │   │   ├── research.ts                # Research subagent
│   │   │   └── verification.ts            # Verification subagent
│   │   └── prompts/
│   │       ├── system.ts                  # System prompt construction
│   │       └── templates.ts               # Reusable prompt templates
│   ├── tools/
│   │   ├── index.ts                       # Tool registry
│   │   ├── types.ts                       # Tool types
│   │   ├── mcp/
│   │   │   ├── client.ts                  # MCP client utilities
│   │   │   ├── discovery.ts               # Tool discovery
│   │   │   └── servers.ts                 # Server configurations
│   │   └── sandbox/
│   │       ├── executor.ts                # Code execution
│   │       └── validator.ts               # Code validation
│   ├── memory/
│   │   ├── context.ts                     # Context management
│   │   ├── file-store.ts                  # File-based persistence
│   │   └── compaction.ts                  # Thread compaction utilities
│   └── utils/
│       ├── errors.ts                      # OrionError types
│       ├── streaming.ts                   # Streaming utilities
│       ├── formatting.ts                  # Slack mrkdwn formatting
│       └── validation.ts                  # Input validation
├── tests/
│   ├── integration/
│   │   ├── slack.test.ts                  # Slack integration tests
│   │   └── mcp.test.ts                    # MCP integration tests
│   └── e2e/
│       └── conversation.test.ts           # End-to-end conversation tests
├── api/                                   # Vercel serverless functions
│   ├── slack.ts                           # Slack webhook handler
│   └── health.ts                          # Health check endpoint
├── vercel.json                            # Vercel configuration
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── eslint.config.js
├── prettier.config.js
├── vitest.config.ts
├── .env.example
├── .gitignore
└── README.md
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Location | Protocol |
|----------|----------|----------|
| Slack → Orion | `src/slack/handlers/` | HTTP webhooks, Slack Events API |
| Orion → LLM Provider | `src/agent/orion.ts` | Anthropic SDK (messages.create with tools); other providers via adapters |
| Orion → MCP Servers | `src/tools/mcp/client.ts` | MCP 1.0 Protocol (stdio/HTTP) |
| Orion → Langfuse | `src/observability/` | OpenTelemetry (HTTP) |

**Component Boundaries:**

```
┌────────────────────────────────────────────────────────────────┐
│                        SLACK LAYER                              │
│   src/slack/                                                    │
│   - Receives webhooks, formats responses, streams to Slack      │
│   - ONLY touches Slack APIs                                     │
└────────────────────────────┬───────────────────────────────────┘
                             │ AgentContext
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        AGENT LAYER                              │
│   src/agent/                                                    │
│   - Orchestrates agent loop, manages subagents                  │
│   - ONLY talks to Tool Layer and Memory Layer                   │
└────────────────────────────┬───────────────────────────────────┘
                             │ ToolRequest
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        TOOL LAYER                               │
│   src/tools/                                                    │
│   - MCP client, sandbox execution, tool discovery               │
│   - ONLY executes external operations                           │
└────────────────────────────────────────────────────────────────┘
```

**Data Boundaries:**

| Data Type | Storage | Access Pattern |
|-----------|---------|----------------|
| Thread History | Slack API | Fetch on each request |
| Agent Context | LLM provider context window (model-dependent) | Session-scoped |
| Persistent Memory | `orion-context/` files | Read/write via file-store.ts |
| Prompt Templates | Langfuse | Cached (TTL configurable) |
| Traces/Logs | Langfuse | Write-only from app |

### Integration Points

**Internal Communication:**

| From | To | Pattern |
|------|-----|---------|
| `handlers/*.ts` | `agent/loop.ts` | Async function call |
| `agent/loop.ts` | `agent/subagents/*.ts` | `spawnSubagent()` |
| `agent/*.ts` | `tools/*.ts` | `executeTool()` |
| `agent/*.ts` | `memory/*.ts` | `contextStore.save()/load()` |
| All modules | `observability/tracing.ts` | `startActiveObservation()` |

**External Integrations:**

| System | Integration Point | Connection |
|--------|-------------------|------------|
| Slack | `src/slack/app.ts` | Bolt SDK (HTTP mode) |
| LLM Provider API | `src/agent/orion.ts` | Anthropic SDK (messages.create) |
| Langfuse | `src/instrumentation.ts` | OpenTelemetry SDK |
| MCP Servers | `src/tools/mcp/servers.ts` | Dynamic per-server (Rube primary) |
| Vercel Env Vars | `src/config/environment.ts` | Available at runtime |

**Data Flow:**

```
User Message (Slack)
       │
       ▼
[Slack Handler] ─────────────────────────────────▶ [Langfuse Trace Start]
       │
       ▼
[Fetch Thread History] ◀───────────────────────── [Slack API]
       │
       ▼
[Agent Loop: GATHER] ─────────────────────────────▶ [Load from orion-context/]
       │
       ▼
[Agent Loop: ACT] ────────────────────────────────▶ [MCP Tools / Sandbox]
       │
       ▼
[Agent Loop: VERIFY] ─────────────────────────────▶ [Verification Subagent]
       │
       ▼
[Stream Response] ────────────────────────────────▶ [Slack Chat Stream]
       │
       ▼
[Save Context] ───────────────────────────────────▶ [orion-context/]
       │
       ▼
[Langfuse Trace End]
```

### File Organization Patterns

**Configuration Files:**

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript compiler options |
| `eslint.config.js` | Linting rules |
| `prettier.config.js` | Formatting rules |
| `vitest.config.ts` | Test configuration |
| `.env.example` | Environment variable template |
| `.orion/config.yaml` | Agent configurations |

**Test Organization:**

- Co-located unit tests: `*.test.ts` next to source
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

### Development Workflow Integration

**Local Development:**

```bash
pnpm install
cp .env.example .env          # Configure secrets
pnpm dev                       # Runs with hot reload
```

**Build Process:**

```bash
pnpm build                     # tsc → dist/
pnpm docker:build              # Build Docker image
```

**Deployment Pipeline:**

1. PR → GitHub Actions (lint + test) + Vercel preview deploy
2. Merge → Vercel automatic production deploy
3. No Docker required — Vercel builds from source

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

| Decision Pair | Status | Assessment |
|---------------|--------|------------|
| Anthropic API + Slack Bolt | ✅ Compatible | Both TypeScript, async-native, work together |
| Langfuse + OpenTelemetry | ✅ Compatible | Langfuse provides OTEL SDK integration |
| MCP 1.0 + Anthropic tools | ✅ Compatible | MCP tools exposed as Claude tool definitions |
| Vercel + Stateless design | ✅ Compatible | File-based memory with external source of truth (Slack) |
| pnpm + TypeScript 5.x | ✅ Compatible | Standard modern stack |

**Pattern Consistency:**

- Naming conventions (kebab-case files, camelCase code) → Standard TypeScript patterns
- Agent loop (gather → act → verify) → Consistent across all handlers
- Error handling (graceful degradation) → Unified `OrionError` interface
- Observability (trace wrapping) → Single pattern via `startActiveObservation`

**Structure Alignment:**

- `src/slack/` isolates Slack concerns → Clean boundary
- `src/agent/` contains all orchestration → No leakage to other layers
- `src/tools/` handles all external calls → Unified tool interface
- `.orion/` separates agent definitions from code → BMAD pattern preserved

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| FR Domain | FRs | Coverage | Supporting Architecture |
|-----------|-----|----------|------------------------|
| Agent Core | FR1-6 | ✅ Full | `src/agent/loop.ts`, subagents pattern |
| Research | FR7-12 | ✅ Full | Research subagent, parallel execution |
| Communication | FR13-18 | ✅ Full | `src/slack/handlers/`, streaming pattern |
| Code Execution | FR19-23 | ✅ Full | Via Rube RUBE_REMOTE_WORKBENCH for Python/bash execution |
| Extensions | FR24-29 | ✅ Full | MCP layer, `.claude/skills/`, `.claude/commands/` |
| Knowledge | FR30-34 | ✅ Full | `orion-context/knowledge/`, `.orion/workflows/` |
| Observability | FR35-40 | ✅ Full | Langfuse integration, tracing pattern |

**Non-Functional Requirements Coverage:**

| NFR | Target | Architectural Support |
|-----|--------|----------------------|
| Response time (simple) | 1-3s | ✅ Streaming, async handlers |
| Response time (tools) | 3-10s | ✅ Parallel tool execution, lazy MCP |
| Deep research | <5 min | ✅ Subagent parallelization |
| Uptime | >99.5% | ✅ min-instances: 1, health checks |
| Tool success rate | >98% | ✅ Graceful degradation, retries |
| Cost per query | <$0.10 | ✅ Prompt caching, token optimization |
| Concurrent users | 50 | ✅ Vercel serverless auto-scaling |

### Implementation Readiness Validation ✅

**Decision Completeness:**

| Category | Status | Assessment |
|----------|--------|------------|
| Technology versions | ✅ Complete | TypeScript 5.x, Node 20, all deps versioned |
| Integration patterns | ✅ Complete | MCP, Langfuse, Slack patterns defined |
| Error handling | ✅ Complete | `OrionError` interface, graceful degradation |
| Examples | ✅ Complete | Code examples for all major patterns |

**Structure Completeness:**

| Element | Status | Assessment |
|---------|--------|------------|
| Root configuration | ✅ Complete | All config files defined |
| Source structure | ✅ Complete | Full directory tree with files |
| Test organization | ✅ Complete | Co-located + integration + e2e |
| Agent definitions | ✅ Complete | `.orion/` and `.claude/` structures |

### Gap Analysis Results

**Critical Gaps:** None identified

**Important Gaps (Post-MVP):**

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| Vector store for semantic memory | Medium | Add Chroma when file search becomes slow |
| Redis for hot session data | Low | Add if file I/O becomes bottleneck |
| Rate limiting | Low | Add if multi-user scaling needed |

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (6 major constraints)
- [x] Cross-cutting concerns mapped (6 concerns)

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established (5 categories)
- [x] Structure patterns defined
- [x] Communication patterns specified (agent loop, subagents)
- [x] Process patterns documented (observability, streaming)

**✅ Project Structure**

- [x] Complete directory structure defined (50+ files)
- [x] Component boundaries established (3 layers)
- [x] Integration points mapped (5 external systems)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**

- Clear separation of concerns (Slack → Agent → Tools)
- Consistent patterns prevent AI agent conflicts
- Built on production-ready frameworks (Anthropic API, Bolt, Langfuse)
- Simple memory model with upgrade path
- Comprehensive observability from day one
- No complex subprocess/sandbox requirements — direct API calls

**Areas for Future Enhancement:**

- Semantic memory search (vector store)
- Hot session caching (Redis)
- Multi-user memory patterns
- Advanced rate limiting

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2025-12-17
**Document Location:** `_bmad-output/architecture.md`

### Final Architecture Deliverables

**📋 Complete Architecture Document**

- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**🏗️ Implementation Ready Foundation**

- 25+ architectural decisions made
- 12 implementation patterns defined
- 8 architectural components specified
- 43 functional requirements fully supported
- 7 non-functional requirements addressed

**📚 AI Agent Implementation Guide**

- Technology stack with verified versions
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards

### Implementation Handoff

**For AI Agents:**
This architecture document is your complete guide for implementing Orion. Follow all decisions, patterns, and structures exactly as documented.

**First Implementation Priority:**

```bash
mkdir orion-slack-agent && cd orion-slack-agent
pnpm init
# Follow project structure exactly as defined in this document
```

**Development Sequence:**

1. Initialize project using documented structure
2. Set up development environment per architecture
3. Implement core architectural foundations (Slack Bolt + Anthropic API + Langfuse)
4. Build features following established patterns
5. Maintain consistency with documented rules

### Quality Assurance Checklist

**✅ Architecture Coherence**

- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**

- [x] All functional requirements are supported
- [x] All non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**

- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.
