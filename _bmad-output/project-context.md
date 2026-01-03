---
project_name: 'orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
sections_completed: ['technology_stack', 'implementation_rules', 'edge_cases', 'operational']
elicitation_methods: ['pre-mortem', 'failure-mode', 'red-team-blue-team', 'code-review-gauntlet', 'critical-perspective']
---

# Project Context for AI Agents

_Critical rules and patterns that AI agents must follow when implementing code. Focus on unobvious details that agents might otherwise miss._

---

## TL;DR — Critical Rules (Read First)

1. **ESM imports:** Always use `.js` extension — `import { x } from './module.js'`
2. **Tool errors:** Never throw, return `ToolResult<T>` with success/error
3. **Slack format:** `*bold*` not `**bold**`, `<url|text>` not `[text](url)`
4. **Logging:** Include `traceId` in every log entry
5. **Config:** Import order matters — `instrumentation.ts` first in `index.ts`

---

## Technology Stack (EXACT VERSIONS)

| Core | Version | Notes |
|------|---------|-------|
| TypeScript | 5.7.2 | Strict mode enabled |
| Node.js | ≥20.0.0 | ES2022 target |
| pnpm | 9.15.0 | Package manager |
| Vitest | 1.6.0 | Test framework |
| ESLint | 8.57.1 | Flat config |
| Prettier | 3.4.2 | Single quotes |

| Key Dependencies | Version |
|------------------|---------|
| @anthropic-ai/sdk | ^0.71.x |
| (MCP session management) | Native implementation via fetch headers |
| @slack/bolt | 4.6.0 |
| langfuse | 3.38.6 |
| @google-cloud/storage | ^7.x |

---

## Critical Implementation Rules

### ESM Import Extension (MANDATORY)

```typescript
// ❌ WRONG - compiles but fails at runtime
import { handler } from './handler'

// ✅ CORRECT - works at runtime
import { handler } from './handler.js'
```

This applies to ALL relative imports.

### Import Order in index.ts

```typescript
// EXACT ORDER REQUIRED
import './instrumentation.js';  // 1. OpenTelemetry first
import { config } from './config/environment.js';  // 2. Config second
// ... then everything else
```

### Tool Handler Pattern (MANDATORY)

Every tool handler MUST wrap its entire body in try/catch:

```typescript
async function myTool(input: Input): Promise<ToolResult<Output>> {
  try {
    // ALL code here, including external calls
    const data = await externalApi.call(input);
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: isRetryable(e)
      }
    };
  }
}
```

No exceptions. Never throw from tool handlers.

### Agent Loop Pattern (MANDATORY)

```typescript
while (true) {
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    messages,
    tools,
    betas: ['context-management-2025-06-27']  // Required for memory
  });
  
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await toolHandlers[block.name](block.input);
      messages.push({ 
        role: 'user', 
        content: [{ type: 'tool_result', tool_use_id: block.id, content: result }] 
      });
    }
  }
  
  if (response.stop_reason !== 'tool_use') break;
}
```

### Tool Naming

- Format: `snake_case`
- Acronyms: lowercase (`api`, `gcs`, `oauth`)
- Numbers: append directly (`oauth2_token`)
- Examples: `search_api`, `get_oauth2_token`, `upload_to_gcs`

### File & Naming Conventions

- **Files:** `kebab-case.ts` — enforced by ESLint
- **Tests:** `kebab-case.test.ts` — co-located with source
- **Classes/Interfaces:** `PascalCase`
- **Functions/Variables:** `camelCase`
- **Constants:** `SCREAMING_SNAKE_CASE`

---

## Slack mrkdwn Reference

This is NOT Markdown. It's Slack's mrkdwn format.

| Element | Slack mrkdwn | NOT Markdown |
|---------|--------------|--------------|
| Bold | `*bold*` | ~~`**bold**`~~ |
| Italic | `_italic_` | ~~`*italic*`~~ |
| Strike | `~strike~` | ~~`~~strike~~`~~ |
| Code | `` `code` `` | Same ✓ |
| Code block | ` ```code``` ` | Same ✓ |
| Link | `<https://url\|text>` | ~~`[text](url)`~~ |
| List | `• item` or `1. item` | Same ✓ |
| Quote | (avoid in responses) | ~~`> quote`~~ |

---

## Type-Level Enforcement

Where possible, rules are enforced by TypeScript:

- `ToolName` — const array, compiler prevents unknown tools
- `MemoryPath` — branded type, prevents raw strings
- `ErrorCode` — literal union, prevents invalid codes
- `SlackUserId` — template literal type `U${string}` (recommended)

**If a rule is enforceable by types, the type is authoritative.**

---

## Observability Rules

### Trace Propagation

- ALL handlers wrapped in `startActiveObservation()`
- Use Slack `event_id` as trace ID when available
- Parallel tool executions share parent traceId

### Span Naming

Format: `{component}.{operation}`

Examples: `agent.loop`, `tool.memory.view`, `slack.message.send`, `mcp.rube.search`

### Logging

```typescript
// ❌ WRONG
logger.info({ event: 'User john@example.com asked about X' });
console.log('Processing message');

// ✅ CORRECT  
logger.info({ 
  event: 'agent.message.received',
  traceId,
  userId: 'U1234ABC',
  messageLength: 150  // Not content itself
});
```

- Event names: `{component}.{action}` format only
- NO PII in logs (user IDs okay, email/names/content NOT okay)
- NO `console.log` — use `logger.*` methods

---

## Memory Path Rules

### Validation

- User IDs: must match `/^U[A-Z0-9]+$/` (Slack format)
- Thread timestamps: must match `/^\d+\.\d+$/`
- Sanitize thread_ts: replace `:` and `.` with `-` for GCS paths
- Allowed extensions: `.json`, `.md`, `.txt`, `.yaml`
- NO binary files

### Constraints

- Max 100KB per memory file
- Handle 404 gracefully: return default value, don't throw
- Use `ifGenerationMatch` for optimistic locking on writes

---

## Loop & Retry Safety

| Limit | Value | Purpose |
|-------|-------|---------|
| Max agent loop iterations | 10 | Prevent infinite loops |
| Max retries per tool | 3 | Prevent retry storms |
| Tool execution timeout | 30s | Prevent hung tool calls |

- Run context compaction BEFORE `messages.create()`, not after
- Validate every `tool_use.id` has matching `tool_result.tool_use_id`

---

## Streaming Safety

- Debounce Slack updates: 250ms minimum between updates
- First response token within 500ms (NFR4)
- Buffer to word/sentence boundaries
- Send heartbeat if silent >10s
- Catch 429 errors and retry with exponential backoff

---

## Parallel Tool Execution

- Claude returns multiple `tool_use` blocks when parallel execution is beneficial
- Execute via `Promise.all()` with individual try/catch — one failure doesn't kill others
- Each tool call shares parent traceId for observability
- Use `AbortController` with 30s timeout per tool call

---

## Operational Requirements

### Health Check

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  logger.info({ event: 'server.shutdown.started' });
  await langfuse.flush();
  await server.close();
  process.exit(0);
});
```

---

## Edge Cases

### Concurrency

- NO global mutable state — each request gets fresh context
- Each request: unique traceId (never reuse)
- Streaming: each response gets its own `say()` instance

### Partial Failures

- Report partial results with clear indication of what failed
- Memory is source of truth, Slack is display
- Langfuse: best-effort, never block response on trace flush

### Message Ordering

- Process by `event_ts`, not arrival order
- Fetch thread context fresh at START of each request
- Message edits: ignore during processing

### Model Resilience

- Log model name in every trace
- Read token limits from API response, don't hardcode
- 401/403: fail fast, don't retry with same key

### MCP Resilience

- Lazy connection: don't connect until first tool call
- Connection timeout: 5s max
- Fallback: continue without unavailable tools, inform user

---

## Config Access Patterns

```typescript
// ✅ Handler (entry point) — can import config
import { config } from '../config/environment.js';
export async function handleMessage() {
  await sendToAnthropic(config.anthropic.apiKey, message);
}

// ✅ Utility — receives config as param
export async function sendToAnthropic(apiKey: string, message: string) {
  // uses apiKey parameter, not config import
}
```

- Entry points: import config directly
- Utilities: receive values as parameters
- NEVER: import config at module level in shared utilities

---

## Environment Variables (REQUIRED)

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
GCS_MEMORIES_BUCKET=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

App crashes on startup if any are missing.

---

## GKE Agent Sandbox (Code Execution)

### Overview

Orion uses **GKE Agent Sandbox** for secure Python code execution with network access. This enables custom Skills and programmatic tool calling that Anthropic's container cannot support (no network access in Anthropic's container).

### Connection Details

| Property | Value |
|----------|-------|
| **GCP Project** | `ai-workflows-459123` |
| **Cluster** | `orion-sandbox-cluster` |
| **Region** | `us-central1` |
| **Namespace** | `default` |
| **Template** | `python-runtime-template` |
| **Warm Pool** | `orion-sandbox-warmpool` (2 replicas) |
| **Router Service** | `sandbox-router-svc:8080` |

### Python Client Usage

```python
from agentic_sandbox import SandboxClient

with SandboxClient(
    template_name='python-runtime-template',
    namespace='default'
) as sandbox:
    result = sandbox.run('python3 -c "print(2+2)"')
    print(result.stdout)  # "4"
```

### Capabilities (Verified 2026-01-03)

| Capability | Status |
|------------|--------|
| Python 3.11 execution | ✅ |
| Network connectivity | ✅ |
| HTTP requests (urllib, requests) | ✅ |
| Socket connections | ✅ |
| MCP tool calls | ✅ (via HTTP) |
| Custom packages | ✅ (via SandboxTemplate) |

### Infrastructure Files

```
infra/gke-sandbox/
├── sandbox-template-and-pool.yaml  # SandboxTemplate + WarmPool
├── sandbox-router.yaml              # Router Deployment + Service
└── README.md                         # Operational docs
```

### kubectl Access

```bash
# Set up credentials
gcloud container clusters get-credentials orion-sandbox-cluster \
  --region=us-central1 \
  --project=ai-workflows-459123

# Check status
kubectl get pods -n default -l sandbox=orion-python-sandbox
kubectl get sandboxwarmpools
```

### Cost Estimate

~$70-150/month (GKE Autopilot with warm pools)

---

## JSDoc Convention

```typescript
/**
 * Brief description.
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - First acceptance criterion
 * @see AR11 - Architectural requirement reference
 */
```

---

## Anti-Patterns (NEVER DO)

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| `import { x } from './module'` | `import { x } from './module.js'` |
| `console.log(...)` | `logger.info({ event: '...' })` |
| Raw memory path strings | `Memory.user(userId, 'prefs.json')` |
| `throw new Error()` in tools | Return `{ success: false, error }` |
| `**bold**` in Slack | `*bold*` |
| Hardcode model names | Use `config.anthropic.model` |
| Missing traceId in logs | Always include `traceId` |
| Global mutable state | Fresh context per request |
| Hardcode token limits | Read from API response |

