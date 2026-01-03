---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/analysis/brainstorming-session-2025-12-22.md"
  - "_bmad-output/sprint-change-proposal-api-alignment-2025-12-22.md"
  - "_bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md"
  - "_bmad-output/analysis/product-brief-2025-12-orion-slack-agent-2025-12-17.md"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2025-12-22'
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
course_correction: 'Claude Agent SDK → Direct Anthropic API (2025-12-22); MCP SDK adoption (2025-12-31)'
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
| Agent Core | FR1-6 | Agent loop execution, verification, parallel tools, context management |
| Research | FR7-12 | Multi-source search, synthesis, parallel information gathering |
| Communication | FR13-18 | Slack integration, streaming, thread context, suggested prompts |
| Code Execution | FR19-23 | On-the-fly code generation, sandboxed execution, API calls *(Phase 2)* |
| Extensions | FR24-29 | Skills, Commands, MCP servers — composable tool layer |
| Knowledge | FR30-34 | Q&A, troubleshooting, domain-specific recommendations |
| Observability | FR35-40 | Langfuse tracing, prompt versioning, cost tracking |
| Persistent Memory | FR44-46 | Cross-session memory via GCS, user/session scopes |
| Slack AI App | FR47-50 | Feedback buttons, dynamic status, error messaging |

**Non-Functional Requirements:**

| Category | Target | Architectural Driver |
|----------|--------|---------------------|
| Response time (simple) | 1-3 seconds | Async streaming, no blocking |
| Response time (tools) | 3-10 seconds | Parallel tool execution |
| Deep research | <5 minutes | Parallel tool execution |
| Request timeout | 300 seconds | Cloud Run long-running support |
| Uptime | >99.5% | min instances = 1, health checks |
| Tool success rate | >98% | Retry logic, graceful degradation |
| Cost per query | <$0.10 | Token optimization, prompt caching |
| Concurrent users | 50 | Cloud Run auto-scaling |

**Scale & Complexity:**

- Primary domain: Backend platform with Slack integration
- Complexity level: Medium-High
- Estimated architectural components: 8-10 major subsystems
- Deployment: Google Cloud Run (HTTP mode, containerized)

### Technical Constraints & Dependencies

| Constraint | Impact |
|------------|--------|
| **Direct Anthropic API** | `messages.create()` with `tool_use` for agent loop; no Agent SDK |
| **Model selection** | Config-driven (provider + model ID) — no hardcoded model names |
| **Slack Bolt + Assistant API** | HTTP webhooks, streaming, thread management |
| **MCP 1.0 Protocol** | Generic HTTP streamable client for any MCP server at runtime |
| **Google Cloud Run** | 300s timeout, min 1 instance, 2GB memory |
| **Langfuse** | OpenTelemetry integration, prompt management |
| **Large model context** | Model-dependent; compaction manages long threads |

### Cross-Cutting Concerns Identified

1. **Observability** — Every component must emit traces to Langfuse
2. **Error Handling** — Graceful degradation when tools fail, verification retry loops
3. **Streaming** — All user-facing responses streamed for perceived performance
4. **Tool Abstraction** — MCP, code gen, agentic search unified under single interface
5. **Context Management** — Thread compaction, prompt caching
6. **Security** — Secrets in GCP Secret Manager, request signature verification, sandboxed code

## Starter Template Evaluation

### Primary Technology Domain

**Agentic Slack Platform** using Direct Anthropic API with Agent Skills support.

### Selected Approach: Custom Structure (Direct API + Agent Skills)

**Rationale:**

- Claude Agent SDK failed on Vercel (sandbox latency issues)
- Direct Anthropic API provides full agent loop capability via `messages.create()` + `tool_use`
- Google Cloud Run provides 300s timeout (vs Vercel's 60s)
- Agent Skills is an open file format ([agentskills.io](https://agentskills.io)) — can be implemented on any agent framework
- MCP via generic HTTP streamable client (not SDK-managed)

### What Claude Agent SDK Provides (We're Replacing)

| SDK Feature | Our Implementation |
|-------------|-------------------|
| `query()` function | Custom agent loop: `while (stop_reason === 'tool_use')` |
| MCP server config | Generic MCP client (HTTP streamable transport) |
| Parallel tool execution | Native Claude tool_use (multiple tools per turn) + `Promise.all()` on execution |
| Skill loading | Custom skill loader reading `SKILL.md` files |
| Context compaction | Sliding window on messages array |

### Agent Skills Implementation (Direct API)

Agent Skills is an open standard from [agentskills.io](https://agentskills.io/home) — folders of instructions, scripts, and resources that agents can discover and use. Implementation pattern:

```typescript
// Load skills from .skills/ directory
async function loadSkills(): Promise<Skill[]> {
  const skillDirs = await glob('.skills/*/SKILL.md');
  return Promise.all(skillDirs.map(parseSkillMd));
}

// Include in system prompt or as tool definitions
function buildSystemPrompt(skills: Skill[]): string {
  const skillInstructions = skills.map(s => 
    `## Skill: ${s.name}\n${s.description}\n${s.instructions}`
  ).join('\n\n');
  
  return `${BASE_SYSTEM_PROMPT}\n\n# Available Skills\n${skillInstructions}`;
}
```

### Project Structure

```
orion-slack-agent/
├── src/
│   ├── index.ts                    # Entry point
│   ├── instrumentation.ts          # OpenTelemetry + Langfuse
│   ├── config/
│   │   └── environment.ts
│   ├── slack/                      # ✅ Already implemented
│   │   ├── app.ts
│   │   ├── assistant.ts
│   │   └── handlers/
│   ├── agent/                      # 🆕 To build
│   │   ├── loop.ts                 # while (stop_reason === 'tool_use')
│   │   ├── orion.ts                # Anthropic messages.create wrapper
│   │   # Parallel execution via native tool_use (no subagents.ts needed)
│   │   └── prompts/
│   │       └── system.ts
│   ├── skills/                     # 🆕 Agent Skills loader
│   │   ├── loader.ts               # Parse SKILL.md files
│   │   └── types.ts
│   ├── tools/                      # 🆕 Tool layer
│   │   ├── registry.ts             # Unified tool interface
│   │   ├── memory/
│   │   │   └── handler.ts          # Anthropic Memory Tool → GCS
│   │   └── mcp/
│   │       ├── client.ts           # Generic MCP client
│   │       └── discovery.ts
│   ├── observability/              # ✅ Already implemented
│   └── utils/                      # ✅ Already implemented
├── .skills/                        # Agent Skills (SKILL.md files)
│   ├── slack-research/
│   │   └── SKILL.md
│   ├── code-review/
│   │   └── SKILL.md
│   └── deep-research/
│       └── SKILL.md
├── docker/
│   └── Dockerfile
├── package.json
└── ...
```

### Core Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.71.x",
    "@slack/bolt": "^4.x",
    "@google-cloud/storage": "^7.x",
    "langfuse": "^3.x",
    "@opentelemetry/sdk-node": "^1.x",
    "dotenv": "^16.x",
    "yaml": "^2.x",
    "glob": "^10.x"
  }
}
```

**Notes:**
- Use `@anthropic-ai/sdk` (base SDK), NOT `@anthropic-ai/claude-agent-sdk`
- MCP session management via native HTTP headers (ADR-2025-12-31, revised 2025-01-02)

### Architectural Decisions Established by Starter

| Category | Decision | Rationale |
|----------|----------|-----------|
| **Language** | TypeScript 5.x | Anthropic SDK + type safety |
| **Runtime** | Node.js 20 LTS | Long-term support, modern features |
| **Package Manager** | pnpm | Fast, disk efficient |
| **Linting** | ESLint + Prettier | Standard, well-supported |
| **Testing** | Vitest | Fast, ESM-native |
| **Build** | tsc (TypeScript compiler) | Simple, reliable |
| **Deployment** | Google Cloud Run | 300s timeout, Docker support |
| **Agent Framework** | Direct Anthropic API | Full control, no SDK latency |
| **Skills** | Agent Skills (SKILL.md) | Open standard, file-based |

## MCP Session Management Decision (ADR-2025-12-31, Updated 2026-01-02)

### Context

During Epic 3 testing, session-based MCP servers (Samba internal MCPs) returned HTTP 400 "Invalid request parameters" errors. Investigation revealed the custom `McpClient` implementation was missing the mandatory MCP lifecycle handshake.

**Root Cause:** MCP specification (2025-06-18) requires:
1. `initialize` request as the FIRST interaction
2. `notifications/initialized` notification BEFORE other requests
3. `MCP-Protocol-Version` header on all subsequent requests

The Story 3.1 Phase 2 implementation only captured session IDs from response headers but did NOT perform the initialization handshake.

### Decision

**Implement full MCP lifecycle compliance** via Story 3.5:

1. **Initialize Handshake:** Send `initialize` → receive `InitializeResult` → send `notifications/initialized`
2. **Session State Machine:** Track DISCONNECTED → INITIALIZING → CONNECTED → FAILED
3. **Protocol Version Header:** Include `MCP-Protocol-Version` on all requests after init
4. **Proper 404 Recovery:** Re-handshake (not just clear session ID) on session expiry

### Rationale

| Option | Pros | Cons |
|--------|------|------|
| **Full lifecycle (selected)** ✅ | Spec-compliant, works with stateful servers | More complex than header-only |
| **Header-only (previous)** | Simple | Violates spec, breaks stateful servers |

### Implementation (Story 3.5)

**Session State Machine:**

```typescript
enum SessionState {
  DISCONNECTED = 'DISCONNECTED',
  INITIALIZING = 'INITIALIZING',
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

// ensureInitialized() called before listTools() and callTool()
async ensureInitialized(): Promise<void> {
  if (this.sessionState === SessionState.CONNECTED) return;
  
  // Mutex: concurrent calls wait for single init
  if (this.initializationPromise) {
    return this.initializationPromise;
  }
  
  this.initializationPromise = this.doInitialize();
  // ... initialization logic
}
```

**Lifecycle Flow:**

```
Client → initialize { protocolVersion, capabilities, clientInfo }
Server → InitializeResult + Mcp-Session-Id header
Client → notifications/initialized (one-way notification)
Client → tools/list (with Mcp-Session-Id + MCP-Protocol-Version headers)
```

**Required Headers (after initialization):**
- `Mcp-Session-Id`: Session identifier from server (if stateful)
- `MCP-Protocol-Version: 2025-06-18` (required by spec)

### Cloud Run Compatibility

| Concern | Mitigation |
|---------|------------|
| Stateless containers | Each container gets its own session (OK for MCP) |
| Cold starts | Lazy init on first tool call |
| Container restarts | Re-initialize session automatically |
| Concurrency | Mutex in `ensureInitialized()` prevents race conditions |

**No Redis needed** — MCP sessions are server-side state; each container can have independent sessions.

### Status

- **Decision Date:** 2025-12-31 (original), 2026-01-02 (revised for full lifecycle)
- **Status:** In Progress
- **Implementation:** Story 3.5 — MCP Session Lifecycle
- **Reference:** `docs/mcp-enterprise-upgrade-proposal.md`, MCP Spec 2025-06-18

---

## Memory Architecture (Step 4)

### Research Validation

Architecture validated against production patterns:

| Source | Pattern | Fit for Orion |
|--------|---------|---------------|
| **Anthropic Memory Tool** | Client-side tool, `/memories` directory, beta API | ✅ Primary |
| **Mem0** (26k+ ⭐) | Vector DB + LLM semantic memory | Future enhancement |
| **LangGraph Checkpointers** | PostgreSQL/SQLite state persistence | Not fit (Python-native) |

### Selected Approach: Anthropic Memory Tool + Google Cloud Storage

**Rationale:**
- Official Anthropic pattern — designed for production agents
- Client-side control — YOU implement the storage backend
- Enables cross-conversation learning and project context
- Compatible with Direct API approach (no Agent SDK required)
- GCS provides durable, scalable file storage for Cloud Run

### How Anthropic Memory Tool Works

1. Enable with beta header: `context-management-2025-06-27`
2. Claude auto-checks `/memories` directory before tasks
3. Claude makes tool calls: `view`, `create`, `update`, `delete`
4. Your handler executes operations against your storage

```typescript
// Example memory tool call from Claude
{
  "type": "tool_use",
  "name": "memory",
  "input": {
    "command": "view",
    "path": "/memories"
  }
}

// Your handler responds with file listing
{
  "type": "tool_result",
  "content": "/memories/project-context.md\n/memories/user-prefs/sid.json"
}
```

### Memory Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD RUN CONTAINER                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Agent Loop (messages.create + tool_use)                │ │
│  │  └── Memory Tool Handler                                 │ │
│  │      └── memoryToolHandler.ts                           │ │
│  │          ├── view(path)   → GCS list/read               │ │
│  │          ├── create(path) → GCS write                    │ │
│  │          ├── update(path) → GCS overwrite                │ │
│  │          └── delete(path) → GCS delete                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │     Google Cloud Storage        │
              │  gs://orion-memories/           │
              │  ├── /memories/                 │
              │  │   ├── project-context.md     │
              │  │   ├── user-prefs/            │
              │  │   └── session-state/         │
              │  └── (versioning enabled)       │
              └─────────────────────────────────┘
```

### Implementation

**Memory Tool Handler:**

```typescript
// src/tools/memory/handler.ts
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_MEMORIES_BUCKET!);

export async function handleMemoryTool(input: { command: string; path: string; content?: string }) {
  const { command, path, content } = input;
  const gcsPath = path.replace('/memories/', '');

  switch (command) {
    case 'view':
      if (path === '/memories' || path.endsWith('/')) {
        // List directory
        const [files] = await bucket.getFiles({ prefix: gcsPath });
        return files.map(f => `/memories/${f.name}`).join('\n') || 'Empty directory';
      }
      // Read file
      const file = bucket.file(gcsPath);
      const [fileContent] = await file.download();
      return fileContent.toString('utf-8');

    case 'create':
    case 'update':
      await bucket.file(gcsPath).save(content!, { contentType: 'text/plain' });
      return `${command === 'create' ? 'Created' : 'Updated'} ${path}`;

    case 'delete':
      await bucket.file(gcsPath).delete();
      return `Deleted ${path}`;

    default:
      throw new Error(`Unknown memory command: ${command}`);
  }
}
```

**Agent Loop Integration:**

```typescript
// src/agent/loop.ts
import Anthropic from '@anthropic-ai/sdk';
import { handleMemoryTool } from '../tools/memory/handler';

const anthropic = new Anthropic();

async function runAgentLoop(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  while (true) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL!,
      max_tokens: 4096,
      tools: [{ type: 'memory' }],  // Enable memory tool
      messages,
      betas: ['context-management-2025-06-27']  // Required for memory
    });

    // Handle tool calls
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'memory') {
        const result = await handleMemoryTool(block.input as any);
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: result }]
        });
      }
    }

    if (response.stop_reason !== 'tool_use') {
      return response;
    }
  }
}
```

### Memory Structure

```
/memories/
├── global/                      # Shared across all users
│   ├── project-context.md       # Orion's understanding of itself
│   └── learned-patterns.md      # Cross-conversation insights
├── users/                       # Per-user memories
│   └── {slack_user_id}/
│       ├── preferences.json     # User-specific settings
│       └── history.md           # Summarized past interactions
└── sessions/                    # Per-conversation context
    └── {thread_ts}/
        └── context.md           # Thread-specific state
```

### GCS Configuration

**Environment Variables:**

```bash
GCS_MEMORIES_BUCKET=orion-memories-prod
```

**GCS Bucket Settings:**

| Setting | Value | Purpose |
|---------|-------|---------|
| Location | us-central1 | Same region as Cloud Run |
| Versioning | Enabled | Recover from accidental deletes |
| Lifecycle | Keep last 10 versions | Limit storage costs |
| IAM | Cloud Run service account only | Principle of least privilege |

### Dependencies Added

```json
{
  "dependencies": {
    "@google-cloud/storage": "^7.x"
  }
}
```

### Security Considerations

| Concern | Mitigation |
|---------|------------|
| Path traversal | Validate all paths start with `/memories/` |
| Data isolation | Prefix with user/session IDs |
| Sensitive data | Don't store secrets; use for context only |
| Access control | GCS IAM + Cloud Run service account |

### Future Enhancement: Mem0 Semantic Search

For semantic memory search across conversations (post-MVP):

```typescript
import { MemoryClient } from 'mem0ai';

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });

// Add to memory after conversations
await mem0.add(messages, { user_id: slackUserId });

// Search relevant memories at conversation start
const relevant = await mem0.search(query, { user_id: slackUserId, limit: 5 });
```

## Implementation Patterns & Consistency Rules (Step 5)

### Pattern Philosophy

> **If it's important enough to document, it's important enough to enforce with types.**

Patterns are organized by enforcement mechanism:

| Tier | Enforcement | Scope |
|------|-------------|-------|
| **1. Enforced** | TypeScript compiler prevents violations | System correctness |
| **2. Documented** | Standards for humans to follow | Debugging/maintainability |
| **3. Automated** | ESLint + Prettier apply automatically | Code style |

### Tier 1: Enforced Patterns (TypeScript)

**Tool Name Registry:**
```typescript
// src/tools/registry.ts
// Single source of truth — compiler error if you use unlisted tool
export const TOOL_NAMES = [
  'memory',
  'search_slack_messages',
  'execute_code',
  'web_search',
  'mcp_call',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

// Handler registry uses ToolName keys — can't register unknown tool
export const toolHandlers: Record<ToolName, ToolHandler> = { ... };
```

**Memory Path Builders:**
```typescript
// src/tools/memory/paths.ts
// Can't use raw strings — must use builders
export type MemoryPath = { __brand: 'MemoryPath'; path: string };

export const Memory = {
  global: (file: string): MemoryPath => 
    ({ __brand: 'MemoryPath', path: `/memories/global/${file}` }),
  user: (userId: string, file: string): MemoryPath => 
    ({ __brand: 'MemoryPath', path: `/memories/users/${userId}/${file}` }),
  session: (threadTs: string, file: string): MemoryPath => 
    ({ __brand: 'MemoryPath', path: `/memories/sessions/${threadTs}/${file}` }),
} as const;
```

**Environment Config:**
```typescript
// src/config/environment.ts
// App crashes on startup if required vars missing
export const config = {
  anthropic: {
    apiKey: requiredEnv('ANTHROPIC_API_KEY'),
    model: requiredEnv('ANTHROPIC_MODEL'),
  },
  slack: {
    botToken: requiredEnv('SLACK_BOT_TOKEN'),
    signingSecret: requiredEnv('SLACK_SIGNING_SECRET'),
  },
  gcs: {
    bucket: requiredEnv('GCS_MEMORIES_BUCKET'),
  },
  langfuse: {
    publicKey: requiredEnv('LANGFUSE_PUBLIC_KEY'),
    secretKey: requiredEnv('LANGFUSE_SECRET_KEY'),
  },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
```

**Error Codes & Tool Result:**
```typescript
// src/types/errors.ts
export const ERROR_CODES = [
  'TOOL_NOT_FOUND',
  'TOOL_EXECUTION_FAILED',
  'MEMORY_NOT_FOUND',
  'MEMORY_WRITE_FAILED',
  'RATE_LIMITED',
  'CONTEXT_TOO_LONG',
  'TOOL_TIMEOUT',
  'MCP_CONNECTION_FAILED',
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export interface ToolError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

// src/types/tools.ts
export type ToolResult<T = unknown> = 
  | { success: true; data: T }
  | { success: false; error: ToolError };
```

### Tier 2: Documented Standards

**Langfuse Span Naming:**
```
Pattern: {component}.{operation}

Components: agent | tool | slack | memory | mcp
Operations: lowercase, dot-separated for sub-ops

Examples:
  agent.loop
  agent.completion
  tool.memory.view
  tool.memory.create
  slack.message.send
  mcp.rube.search
```

**Logging Context:**
```typescript
// Every log entry should include:
interface LogContext {
  traceId: string;        // Langfuse trace
  spanName: string;       // Current operation
  slackThreadTs?: string; // If in Slack context
}

// Levels:
// ERROR → User-impacting, needs action
// WARN  → Degraded, needs monitoring
// INFO  → Key events (tool calls, completions)
// DEBUG → Dev only
```

**Layered Error Architecture:**
```typescript
// Internal (logged) → ToolError (to Claude) → UserError (to Slack)

interface InternalError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  stack?: string;
  retryable: boolean;
  timestamp: string;
  traceId: string;
}

// To Slack user — human-friendly, no jargon
interface UserError {
  message: string;
}
```

**Slack Response Format:**
```typescript
// Hybrid: Claude markdown + Block Kit structure
function formatResponse(content: string, suggestedPrompts?: string[]): SlackBlocks {
  const blocks: Block[] = [
    { type: 'section', text: { type: 'mrkdwn', text: content } },
  ];
  
  if (suggestedPrompts?.length) {
    blocks.push({
      type: 'actions',
      elements: suggestedPrompts.slice(0, 5).map((prompt, i) => ({
        type: 'button',
        text: { type: 'plain_text', text: truncate(prompt, 75) },
        action_id: `suggested_${i}`,
        value: prompt,
      })),
    });
  }
  
  return { blocks };
}
```

**Parallel Tool Execution:**
```typescript
// Tools execute in parallel when Claude returns multiple tool_use blocks in a single response
// Implementation: Promise.all() on tool handlers when multiple tool_use blocks received
// Claude natively manages context and result synthesis
// See: ADR Epic 4 Removal (sprint-change-proposal-2025-12-31-epic4-removal.md)

async function executeTools(toolBlocks: ToolUseBlock[]): Promise<ToolResult[]> {
  return Promise.all(toolBlocks.map(block => 
    toolHandlers[block.name](block.input)
  ));
}
```

### Tier 3: Automated (Tooling)

ESLint + Prettier handle these automatically:

| Concern | Tool | Config |
|---------|------|--------|
| Formatting | Prettier | `.prettierrc` |
| Linting | ESLint | `eslint.config.js` |
| Import order | eslint-plugin-import | Automatic |
| Type checking | TypeScript strict | `tsconfig.json` |

### Test Organization

**Co-located Unit Tests:**
```
src/
├── agent/
│   ├── loop.ts
│   ├── loop.test.ts          ← Unit tests here
├── tools/
│   ├── memory/
│   │   ├── handler.ts
│   │   └── handler.test.ts
tests/
└── integration/              ← Integration tests only
    └── agent-flow.test.ts
```

### Pattern Enforcement Summary

| Problem | Pattern | Enforcement |
|---------|---------|-------------|
| Unknown tool error | `TOOL_NAMES` registry | TypeScript const |
| Memory path typo | `Memory.*` builders | Branded type |
| Missing env var | `config` module | Runtime crash |
| Invalid error code | `ErrorCode` type | TypeScript union |
| Untrackable logs | `traceId` in context | Code review |
| Style inconsistency | Prettier/ESLint | Pre-commit hook |

## Project Structure & Boundaries (Step 6)

### Epic to Directory Mapping

| Epic | Description | Primary Directory | Phase |
|------|-------------|-------------------|-------|
| **Epic 1** | Slack Integration | `src/slack/` | MVP |
| **Epic 2** | Agent Loop | `src/agent/` | MVP |
| **Epic 3** | MCP Integration | `src/tools/mcp/` | MVP |
| **Epic 4** | ~~Subagents~~ REMOVED | N/A | Removed 2025-12-31 |
| **Epic 5** | Skills & Extensions | `.orion/` + `src/skills/` | MVP |
| **Epic 6** | UX & Polish | `src/slack/` (suggested prompts) | MVP |
| **Epic 7** | Knowledge & Q&A | `src/tools/` (search tools) | MVP |
| **Epic 8** | Observability | `src/observability/` | MVP |
| **Epic 9** | Sandbox/Code Execution | `src/tools/sandbox/` | Phase 2 |

### Complete Project Directory Structure

```
orion-slack-agent/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── prettier.config.js
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── docker/
│   ├── Dockerfile
│   └── cloudbuild.yaml                    # Cloud Build trigger
│
├── .github/
│   └── workflows/
│       └── ci.yaml                        # Test + lint on PR
│
├── .orion/                                # Agent definitions (BMAD-inspired)
│   ├── agent.yaml                         # Main agent config
│   ├── skills/                            # Skill definitions
│   │   └── example-skill/
│   │       └── SKILL.md                   # Agent Skills format
│   ├── commands/                          # Custom slash commands
│   │   └── deep-research.yaml
│   └── prompts/                           # System prompts
│       ├── system.md                      # Core system prompt
│       └── verification.md                # Verification prompt
│
├── orion-context/                         # Agentic search context
│   ├── conversations/                     # Thread context cache
│   ├── knowledge/                         # Project knowledge
│   └── user-preferences/                  # User prefs per Slack ID
│
├── src/
│   ├── index.ts                           # Entry point
│   ├── instrumentation.ts                 # OTel init (must be first)
│   │
│   ├── config/
│   │   ├── environment.ts                 # Env config + validation
│   │   └── environment.test.ts
│   │
│   ├── types/                             # Shared type definitions
│   │   ├── index.ts                       # Re-exports
│   │   ├── tools.ts                       # ToolResult, ToolName
│   │   ├── errors.ts                      # ErrorCode, OrionError
│   │   ├── agent.ts                       # AgentContext, AgentMessage
│   │   └── slack.ts                       # SlackThread, SlackUser
│   │
│   ├── agent/                             # Epic 2: Agent Loop
│   │   ├── loop.ts                        # Main agent loop
│   │   ├── loop.test.ts
│   │   ├── context.ts                     # Context builder
│   │   ├── context.test.ts
│   │   ├── verification.ts                # Response verification
│   │   ├── verification.test.ts
│   │   ├── compaction.ts                  # Sliding window compaction
│   │   ├── compaction.test.ts
│   │   # Parallel execution: Native Claude tool_use + Promise.all()
│   │   # No separate subagents layer needed (ADR 2025-12-31)
│   │
│   ├── tools/                             # Epic 3, 4, 8: Tool layer
│   │   ├── registry.ts                    # TOOL_NAMES, handlers
│   │   ├── registry.test.ts
│   │   │
│   │   ├── memory/                        # Anthropic Memory Tool
│   │   │   ├── handler.ts                 # Memory → GCS
│   │   │   ├── handler.test.ts
│   │   │   └── paths.ts                   # Type-safe path builders
│   │   │
│   │   ├── mcp/                           # Epic 3: MCP Client
│   │   │   ├── manager.ts                 # McpClientManager singleton (SDK wrapper)
│   │   │   ├── manager.test.ts
│   │   │   ├── discovery.ts               # Tool discovery (uses manager)
│   │   │   ├── discovery.test.ts
│   │   │   └── servers.ts                 # MCP server configurations
│   │   │
│   │   ├── sandbox/                       # Epic 9: Code execution (Phase 2)
│   │   │   ├── executor.ts                # Rube workbench wrapper
│   │   │   └── executor.test.ts
│   │   │
│   │   └── search/                        # Epic 7: Knowledge search
│   │       ├── slack.ts                   # Slack search
│   │       ├── web.ts                     # Web search via MCP
│   │       └── confluence.ts              # Confluence via MCP
│   │
│   ├── skills/                            # Epic 5: Skills runtime
│   │   ├── loader.ts                      # SKILL.md parser
│   │   ├── loader.test.ts
│   │   └── executor.ts                    # Skill execution
│   │
│   ├── slack/                             # Epic 1: Slack layer
│   │   ├── app.ts                         # Bolt app
│   │   ├── app.test.ts
│   │   ├── assistant.ts                   # Assistant API
│   │   ├── assistant.test.ts
│   │   ├── response-generator.ts          # Streaming response
│   │   ├── response-generator.test.ts
│   │   ├── thread-context.ts              # Thread fetching
│   │   ├── thread-context.test.ts
│   │   ├── types.ts                       # Slack types
│   │   ├── suggested-prompts.ts           # Epic 6: Prompt suggestions
│   │   └── handlers/
│   │       ├── user-message.ts
│   │       ├── user-message.test.ts
│   │       ├── thread-started.ts
│   │       ├── thread-started.test.ts
│   │       ├── thread-context-changed.ts
│   │       └── thread-context-changed.test.ts
│   │
│   ├── observability/                     # Epic 8: Tracing
│   │   ├── langfuse.ts                    # Langfuse client
│   │   ├── langfuse.test.ts
│   │   ├── tracing.ts                     # OTel + spans
│   │   ├── tracing.test.ts
│   │   ├── test-trace.ts
│   │   └── cost-tracking.ts               # Token/cost tracking
│   │
│   └── utils/
│       ├── logger.ts                      # Structured JSON logging
│       ├── logger.test.ts
│       ├── formatting.ts                  # Slack mrkdwn formatting
│       ├── formatting.test.ts
│       ├── streaming.ts                   # Stream utilities
│       └── streaming.test.ts
│
├── tests/
│   └── integration/                       # Integration tests
│       ├── agent-flow.test.ts             # Full agent loop
│       └── mcp-connection.test.ts         # MCP connectivity
│
├── docs/
│
└── _bmad-output/                          # BMAD outputs
    ├── architecture.md                    # This document
    ├── prd.md
    ├── epics.md
    └── implementation-artifacts/
```

### Architectural Boundaries

**API Boundaries:**
```
External:
  Slack Events API → src/slack/ → Agent Loop
  Anthropic API ← src/agent/loop.ts
  MCP Servers ← src/tools/mcp/client.ts (native session management via HTTP headers)
  GCS ← src/tools/memory/handler.ts

Internal:
  Agent → Tools: via ToolRegistry (src/tools/registry.ts)
  Agent → Slack: via response-generator.ts
```

**Component Boundaries:**
```
┌─────────────────────────────────────────────────────────────┐
│                        Slack Layer                          │
│  (Handlers receive events, format responses, stream)        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                        Agent Layer                          │
│  (Loop, verification, context compaction)                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                        Tool Layer                           │
│  (Memory, MCP via SDK, sandbox, search — all via registry)  │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
```
1. Slack Event → src/slack/handlers/
2. Handler → src/agent/loop.ts (runs agent)
3. Agent → src/tools/registry.ts (when tool_use)
4. Tools → MCP/GCS/external
5. Agent → src/agent/verification.ts (verify response)
6. Agent → src/slack/response-generator.ts (stream to Slack)
7. All steps → src/observability/ (Langfuse traces)
```

### Requirements to Structure Mapping

| Requirement | File(s) |
|-------------|---------|
| FR1-2 (Agent loop, verification) | `src/agent/loop.ts`, `src/agent/verification.ts` |
| FR3-4 (Parallel tools) | Native Claude tool_use + Promise.all() execution |
| FR5 (Context compaction) | `src/agent/compaction.ts` |
| FR13-18 (Slack) | `src/slack/*` |
| FR19-23 (Code gen) | `src/tools/sandbox/executor.ts` *(Phase 2)* |
| FR24-29 (Extensions) | `.orion/skills/`, `src/skills/loader.ts` |
| FR26-28 (MCP) | `src/tools/mcp/client.ts` (native session management) |
| FR35-40 (Observability) | `src/observability/langfuse.ts` |
| AR29-31 (Memory) | `src/tools/memory/handler.ts` |
| FR47-50 (Slack AI) | `src/slack/handlers/*.ts`, `src/slack/feedback.ts` |

### Slack AI App Patterns (FR47-50)

Slack's AI Apps framework provides native UX patterns we must leverage. Reference: [Slack AI Apps Docs](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)

**1. Dynamic Status Messages (FR47)**

Use `setStatus` with `loading_messages` array for tool execution feedback:

```typescript
// Instead of static: setStatus('is thinking...')
// Use dynamic array that Slack cycles through:
await setStatus({
  status: 'thinking...',
  loading_messages: [
    'Searching Confluence...',
    'Calling Jira API...',
    'Analyzing results...',
    'Preparing response...',
  ],
});
```

When to update status:
- Before starting tool execution → add tool-specific message
- During multi-tool execution → cycle shows progress
- Agent knows which tool is active → status reflects it

**2. Feedback Buttons (FR48)**

Slack provides native `feedback_buttons` Block Kit element:

```typescript
const feedbackBlock = {
  type: 'context_actions',
  elements: [{
    type: 'feedback_buttons',
    action_id: 'orion_feedback',
    positive_button: {
      text: { type: 'plain_text', text: 'Helpful' },
      accessibility_label: 'Mark this response as helpful',
      value: 'positive',
    },
    negative_button: {
      text: { type: 'plain_text', text: 'Not helpful' },
      accessibility_label: 'Mark this response as not helpful',
      value: 'negative',
    },
  }],
};

// Attach to streamer.stop()
await streamer.stop({ blocks: [feedbackBlock] });
```

**3. Feedback Handler (FR49)**

Log feedback to Langfuse for quality tracking:

```typescript
// src/slack/handlers/feedback.ts
app.action('orion_feedback', async ({ ack, body, client, context }) => {
  await ack();
  
  const isPositive = body.actions[0].value === 'positive';
  const messageTs = body.message.ts;
  
  // Log to Langfuse with trace correlation
  langfuse.score({
    name: 'user_feedback',
    value: isPositive ? 1 : 0,
    traceId: getTraceIdFromMessageTs(messageTs),
    comment: isPositive ? 'positive' : 'negative',
  });
  
  // Acknowledge to user
  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: isPositive 
      ? "Thanks for the feedback! 👍" 
      : "Sorry this wasn't helpful. Starting a new thread may help.",
  });
});
```

**4. Error Messages (FR50)**

Contextual error messages with suggested actions:

```typescript
// On tool failure
await say({
  text: `I couldn't complete that request. The ${toolName} service is currently unavailable.`,
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Unable to complete request*\nThe ${toolName} service didn't respond.\n\n*What you can try:*\n• Wait a moment and try again\n• Rephrase your request\n• Ask me to use a different approach`,
      },
    },
  ],
});
```

**Reference Implementation:**
- [Slack App Agent Template](https://github.com/slack-samples/bolt-js-assistant-template)

## Architecture Validation Results (Step 7)

### Coherence Validation ✅

**Decision Compatibility:**

All technology choices work together without conflicts:

| Stack Element | Compatible With | Verified |
|---------------|-----------------|----------|
| TypeScript 5.x | @anthropic-ai/sdk 0.71.x | ✅ |
| Node.js 20 LTS | All dependencies | ✅ |
| Direct Anthropic API | Agent Skills (SKILL.md) | ✅ |
| Native MCP session mgmt | Cloud Run, MCP sessions | ✅ |
| Cloud Run (300s) | Long agent loops | ✅ |
| GCS + Memory Tool | Cloud Run stateless | ✅ |
| Langfuse | OpenTelemetry | ✅ |
| Slack Bolt 4.x | HTTP mode | ✅ |

**Pattern Consistency:**

All implementation patterns support architectural decisions:

| Area | Pattern | Consistent |
|------|---------|------------|
| Tool naming | `snake_case` via `TOOL_NAMES` registry | ✅ |
| Memory paths | `Memory.*` builders (branded types) | ✅ |
| Error handling | Layered: InternalError → ToolError → UserError | ✅ |
| Logging | traceId required on all entries | ✅ |
| Span naming | `{component}.{operation}` pattern | ✅ |

**Structure Alignment:**

Project structure supports all decisions with clear boundaries.

### Requirements Coverage Validation ✅

**Epic Coverage:**

| Epic | Description | Support Status |
|------|-------------|----------------|
| Epic 1 | Slack Integration | ✅ `src/slack/` |
| Epic 2 | Agent Loop | ✅ `src/agent/` |
| Epic 3 | MCP Integration | ✅ `src/tools/mcp/` |
| Epic 4 | ~~Subagents~~ | ❌ Removed 2025-12-31 |
| Epic 5 | Skills & Extensions | ✅ `.orion/` + `src/skills/` |
| Epic 6 | UX & Polish | ✅ `src/slack/suggested-prompts.ts` |
| Epic 7 | Slack AI App (FR47-50) | ✅ `src/slack/feedback.ts`, handlers |
| Epic 8 | Observability | ✅ `src/observability/` |
| Epic 9 | Sandbox/Code Execution | ⏳ `src/tools/sandbox/` (Phase 2) |

**Functional Requirements Coverage:** 50/50 FRs covered (FR1-46 + FR47-50)

**Non-Functional Requirements Coverage:** 28/28 NFRs addressed

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ All critical technologies have versions specified
- ✅ Implementation code patterns provided with examples
- ✅ Type definitions shown (ToolResult, MemoryPath, ErrorCode)

**Structure Completeness:**
- ✅ Complete directory tree with all files
- ✅ Epic → directory mapping explicit
- ✅ Component boundaries diagrammed

**Pattern Completeness:**
- ✅ All conflict points addressed via TypeScript types
- ✅ Test organization defined (co-located unit, separate integration)
- ✅ CI/CD structure specified

### Gap Analysis Results

**Critical Gaps:** None

**Important Gaps (addressable during implementation):**
1. Health check endpoint (`/health`) for Cloud Run — add to `src/index.ts`
2. Rate limiting pattern — implement at Slack handler level
3. Model fallback strategy — add to config if primary model unavailable

**Future Enhancements:**
1. Semantic memory via Mem0 (documented)
2. OpenAPI spec for internal tools

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Direct Anthropic API gives full control over agent loop
- Cloud Run provides sufficient timeout (300s) for complex workflows
- GCS-backed Memory Tool enables persistent learning
- Type-safe patterns prevent common implementation errors
- Clear Epic → Directory mapping guides AI agents

**Areas for Future Enhancement:**
- Mem0 semantic memory for cross-conversation search
- Model router for multi-provider support
- Advanced rate limiting with per-user quotas

### Implementation Handoff

**AI Agent Guidelines:**
1. Follow all architectural decisions exactly as documented
2. Use implementation patterns consistently across all components
3. Respect project structure and boundaries
4. Refer to this document for all architectural questions
5. Use branded types (`MemoryPath`, `ToolName`, `ErrorCode`) — never raw strings

**First Implementation Priority:**
```bash
# Start with Epic 2: Agent Loop (core capability)
pnpm install
# Create src/agent/loop.ts following the patterns in this document
```

## Architecture Completion Summary (Step 8)

### Workflow Completion

| Metric | Value |
|--------|-------|
| **Status** | ✅ COMPLETED |
| **Steps Completed** | 8/8 |
| **Date Completed** | 2025-12-22 |
| **Document Location** | `_bmad-output/architecture.md` |

### Final Architecture Deliverables

**📋 Complete Architecture Document**
- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**🏗️ Implementation Ready Foundation**
- 15+ architectural decisions made
- 10+ implementation patterns defined
- 9 epics mapped to architectural components
- 43 functional requirements fully supported
- 28 non-functional requirements addressed

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**
- [x] All functional requirements supported
- [x] All non-functional requirements addressed
- [x] Cross-cutting concerns handled
- [x] Integration points defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples provided for clarity

---

**Architecture Status:** ✅ READY FOR IMPLEMENTATION

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

**Last Updated:** 2025-12-31 — Added ADR for MCP SDK adoption; removed subagent references per Epic 4 removal.
