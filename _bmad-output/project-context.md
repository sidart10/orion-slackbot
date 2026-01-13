---
project_name: 'orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
last_updated: '2026-01-12'
sections_completed: ['technology_stack', 'implementation_rules', 'edge_cases', 'operational', 'ptc_skills', 'skill_file_sync']
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
6. **PTC/Skills:** Use `config.anthropic.allBetas` array, not individual beta strings
7. **Container reuse:** Track `container.id` by `threadTs` via `containerLifecycle`
8. **References:** Use `*References:*` header (NO emoji), format: `[n] Tool - "query"`

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

| Key Dependencies | Version | Notes |
|------------------|---------|-------|
| @anthropic-ai/sdk | ^0.72.x | PTC + Skills API support |
| @slack/bolt | 4.6.0 | HTTP mode, Assistant API |
| langfuse | 3.38.6 | Tracing + prompt management |
| @google-cloud/storage | ^7.x | Memory persistence |
| fflate | ^0.8.x | ZIP skills for upload |

### Required Beta Headers (2026-01-07)

All betas consolidated in `config.anthropic.allBetas`:

```typescript
allBetas: [
  'context-management-2025-06-27', // Memory tool auto-context
  'advanced-tool-use-2025-11-20',  // PTC - Programmatic Tool Calling
  'code-execution-2025-08-25',     // Skills execution + container
  'skills-2025-10-02',             // Skills API CRUD operations
  'files-api-2025-04-14',          // File downloads from container
]
```

**IMPORTANT:** Always pass `config.anthropic.allBetas` to `messages.create()`. Never construct beta arrays manually.

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
// Build container parameter with skills (Story 6.2/6.3)
const container = buildContainerParameter(skillIds);
if (existingContainerId) {
  container.id = existingContainerId; // Reuse across turns
}

while (true) {
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    messages,
    tools,
    container,  // PTC + Skills
    betas: config.anthropic.allBetas,  // ALL betas consolidated
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

  // Extract container ID for reuse (from message_start event when streaming)
  if (response.container?.id && !activeContainerId) {
    activeContainerId = response.container.id;
    containerLifecycle.setContainerId(threadTs, activeContainerId);
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

## References Block Pattern (Story 8.1)

Orion uses a unified `*References:*` footer block for source attribution.

### Format Rules

```
*References:*
[1] Tool Name - "search query"
[2] <https://url|Title>
[3] "cited excerpt..." - Document.pdf, page 5
```

- **Header:** `*References:*` (bold in mrkdwn, NO emoji)
- **Tool sources:** `[n] Tool Name - "query"` (no emoji prefix)
- **URL sources:** `[n] <url|title>` (clickable link)
- **Document citations:** `[n] "excerpt..." - Document.pdf, page N`

### Module Organization

```
src/slack/citations/
  types.ts        # DocumentCitation, ToolSource, UnifiedReference
  parser.ts       # extractCitations() - parse Anthropic response
  formatter.ts    # formatReferencesBlock() - create Block Kit
  index.ts        # Public exports
```

### Integration Points

1. **Agent Loop:** Returns `documentCitations: DocumentCitation[]` in AgentLoopResult
2. **Slack Handler:** Calls `formatReferencesBlock(toolSources, documentCitations)`
3. **Langfuse:** `citation.response` event with `tool_source_count`, `document_citation_count`, `citation_types`

### Backwards Compatibility

- Empty `documentCitations[]` when no documents sent to Claude
- Parser gracefully returns `[]` for responses without citations
- Existing tool source tracking unchanged

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

## GKE Agent Sandbox (FALLBACK ONLY — 2026-01-07)

### Overview

> **⚠️ DEMOTED TO FALLBACK:** As of 2026-01-07, Anthropic's PTC + Skills API is the primary code execution path. GKE sandbox is retained ONLY for edge cases requiring Playwright or local filesystem access.

Orion uses **GKE Agent Sandbox** as a **fallback** for secure Python code execution with network access. Most code execution now uses Anthropic's managed container via PTC.

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

## Programmatic Tool Calling (PTC) & Skills API (2026-01-07)

### Overview

Orion uses Anthropic's **Programmatic Tool Calling (PTC)** with **custom Skills** for code execution. This replaces most GKE sandbox use cases.

**Key Insight:** Anthropic's container has "no network access" for arbitrary HTTP, BUT MCP tool calls via `allowed_callers` ARE supported because Anthropic routes them server-side.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Orion Slack Agent (Cloud Run)                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    ANTHROPIC API                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │           CODE EXECUTION CONTAINER                    │  │ │
│  │  │                                                      │  │ │
│  │  │  • Custom Skills (uploaded via Skills API)           │  │ │
│  │  │  • code_execution tool (PTC)                         │  │ │
│  │  │  • allowed_callers → MCP tools (Anthropic routes)    │  │ │
│  │  │  • Container reuse via container.id                  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  FILES API                                            │  │ │
│  │  │  - Download generated files (xlsx, pdf, pptx)        │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### PTC Tool Definition (EXACT)

```typescript
// The code_execution tool MUST use this exact format
const codeExecutionTool = {
  type: 'code_execution_20250825' as const,
  name: 'code_execution',
};

// Add to tools array alongside MCP and memory tools
const tools = [
  ...mcpTools,
  codeExecutionTool as unknown as Anthropic.Tool,
  ...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
];
```

### Container Parameter (Skills Integration)

```typescript
import { buildContainerParameter, containerLifecycle } from '../skills/index.js';

// Build with skills on first call
const container = buildContainerParameter(skillIds);
// container = { skills: ['skl_abc123', 'skl_def456'], allowed_callers: [...] }

// Reuse on subsequent calls in same thread
const existingId = containerLifecycle.getContainerId(threadTs);
if (existingId) {
  container.id = existingId;
}
```

### Container Lifecycle Management

```typescript
// SINGLETON - imported from src/skills/container-lifecycle.ts
import { containerLifecycle } from '../skills/index.js';

// Get existing container ID for a thread
const containerId = containerLifecycle.getContainerId(threadTs);

// Store new container ID (after first PTC call)
containerLifecycle.setContainerId(threadTs, newContainerId);

// TTL: 30 minutes idle, auto-cleanup of expired entries
// Max entries: 1000 (LRU eviction)
```

### Skills API Client Usage

```typescript
import { skillsApi } from '../skills/api-client.js';

// Create skill (uploads .zip with SKILL.md + scripts/)
const { skillId, versionId } = await skillsApi.createSkill(
  'my-skill',
  'Description',
  skillFiles  // SkillFile[]
);

// List all skills
const skills = await skillsApi.listSkills();

// Get skill details
const skill = await skillsApi.getSkill(skillId);
```

### File Output Handling (Story 6.6)

```typescript
// PTC generates files → stored in container → download via Files API
// Returned as generatedFileIds in AgentLoopResult

interface AgentLoopResult {
  // ... other fields
  generatedFileIds: string[];  // File IDs to download and upload to Slack
}

// In Slack handler:
if (result.generatedFileIds.length > 0) {
  await slackFileUploader.uploadFilesToThread(
    result.generatedFileIds,
    threadTs
  );
}
```

### Observability for PTC

```typescript
// Langfuse events for container lifecycle
langfuse.event({
  name: 'container.lifecycle.create',  // New container
  // or
  name: 'container.lifecycle.reuse',   // Reused from lifecycle
  metadata: { threadTs, containerId, skillCount }
});

// Track PTC tool calls
let ptcToolCallCount = 0;
let ptcContainerStartTime: number | undefined;

// Log on each code_execution block
logger.debug({
  event: 'agent.loop.ptc_tool_call',
  traceId,
  ptcCallNumber: ++ptcToolCallCount,
  containerId: activeContainerId,
});
```

### Model-Specific Behavior

| Model | PTC Support | Notes |
|-------|-------------|-------|
| claude-sonnet-4-20250514 | ✅ Full | Primary model for PTC |
| claude-3-5-sonnet-* | ⚠️ Limited | May not support all PTC features |
| claude-3-opus-* | ❌ No | Use GKE sandbox for code execution |

### Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Missing beta headers | Always use `config.anthropic.allBetas` |
| Hardcoded beta strings | Import from config, never inline |
| Container not reused | Track via `containerLifecycle` by `threadTs` |
| Files not extracted | Check `response.container?.files` and use Files API |
| Skills not loaded | Call `initializeSkills()` at startup |
| Wrong tool type format | Use `code_execution_20250825` (dated version) |
| Missing tool_search_tool | Add `tool_search_tool_bm25` to tools array when deferred tools exist |

### Skill File Loading and Sync

Skills support arbitrary file types including assets (fonts, images, logos).

**What Gets Uploaded:**
- ALL files in `.skills/{name}/` directory (not just SKILL.md and scripts)
- Binary files (fonts, images) read as Buffer
- Text files read as UTF-8

**Exclusions:**
- `.venv/`, `node_modules/`, `__pycache__/`, `.git/`
- Hidden files (starting with `.`)

**Hash-Based Versioning:**
- `hashSkillDirectory()` hashes ALL files in the skill directory
- Changes to any file (including assets) trigger a new skill version upload
- Ensures fonts, logos, and other resources stay in sync

**Container Path:**
Skills are mounted at `/skills/{skill-name}/` in the Anthropic container.

**SKILL.md Quick Start Section:**
Every skill should include a Quick Start section showing:
```markdown
## Quick Start

```python
import sys
sys.path.insert(0, '/skills/my-skill/scripts')
from my_module import MyClass

# Set assets directory for fonts/images
ASSETS_DIR = '/skills/my-skill/assets'
```
```

This ensures Claude knows the exact import path and asset location.

### File Locations

| File | Purpose |
|------|---------|
| `src/skills/api-client.ts` | Skills API CRUD operations |
| `src/skills/container-builder.ts` | Build `container` parameter |
| `src/skills/container-lifecycle.ts` | Track container IDs by thread |
| `src/skills/sync-service.ts` | Sync .skills/ to API at startup (loads ALL files) |
| `src/skills/init.ts` | Initialize skills on app start |
| `src/skills/types.ts` | All skill-related types |
| `src/files/api-client.ts` | Files API download client |
| `src/slack/utils/media-upload.ts` | Media URL extraction, stripping, and Slack upload |
| `scripts/upload-skills.ts` | CI/CD skill upload script |

---

## Media Upload Handling (Genmedia)

### Overview

When genmedia tools (Imagen, Veo) or other tools generate files, Orion:
1. **Strips media URLs** from streamed response text (users don't see raw GCS URLs)
2. **Downloads files** from GCS (gs:// or signed https:// URLs)
3. **Uploads to Slack** with proper filetype for inline rendering

### Supported File Types

| Category | Extensions |
|----------|------------|
| **Images** | png, jpg, jpeg, gif, webp, bmp, svg, ico, tiff |
| **Videos** | mp4, mov, avi, mkv, webm, m4v, flv, wmv |
| **Audio** | mp3, wav, ogg, m4a, flac, aac |
| **Documents** | pdf, doc, docx, xls, xlsx, ppt, pptx, txt, rtf, csv |
| **Web/Code** | html, css, js, json, xml, yaml, md |
| **Archives** | zip, tar, gz, rar, 7z |

### Key Functions

```typescript
// Strip GCS/media URLs from text before streaming to Slack
stripImageUrls(text: string): string

// Extract media URLs from response text
extractImageUrls(text: string): string[]

// Download files and upload to Slack thread
uploadImagesFromResponse(client, channelId, threadTs, responseText, traceId)
```

### URL Patterns Handled

| Pattern | Example |
|---------|---------|
| GCS URI | `gs://bucket/path/video.mp4` |
| GCS Signed URL | `https://storage.mtls.cloud.google.com/bucket/file.mp4` |
| GCS Standard | `https://storage.googleapis.com/bucket/file.pdf` |

**Security:** Only GCS URLs are processed (trusted source). Random HTTP URLs are ignored.

### Handler Integration

Both `app-mention.ts` and `user-message.ts` handlers:
1. Call `stripImageUrls(chunk)` during streaming (removes URLs from displayed text)
2. Keep raw `fullResponse` for URL extraction
3. Call `uploadImagesFromResponse()` after streaming completes

### File Location

| File | Purpose |
|------|---------|
| `src/slack/utils/media-upload.ts` | Core media handling utilities |

---

## Tool Search (Story 8.2)

### Overview

Orion uses Anthropic's **Tool Search** capability to reduce token usage when many MCP tools are available. Instead of passing all tool definitions in context, non-core tools are annotated with `defer_loading: true` and discovered on-demand.

### Benefits

- **Token savings:** 100+ tools at ~200 tokens each = 20k+ tokens saved per request
- **Latency improvement:** Smaller context = faster API calls
- **Scalability:** Can add unlimited MCP tools without context window pressure

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `TOOL_SEARCH_ENABLED` | `true` | Enable/disable tool search feature |
| `CORE_TOOLS` | `memory,code_execution,summarize` | Comma-separated list of always-loaded tools |

### Model Requirements

Tool Search requires Sonnet 4.5+ or Opus 4.5+ models:

```typescript
// Supported models (pattern matching)
/^claude-sonnet-4-/  // e.g., claude-sonnet-4-20250514
/^claude-opus-4-/    // e.g., claude-opus-4-20250801

// NOT supported
/^claude-3-/         // claude-3-opus, claude-3-sonnet
/^claude-3-5-/       // claude-3-5-sonnet, claude-3-5-haiku
```

### How It Works

1. **Request:** Core tools (always loaded) + MCP tools with `defer_loading: true` + `tool_search_tool_bm25`
2. **Discovery:** Claude uses `tool_search_tool_bm25` to discover relevant deferred tools
3. **Claude calls:** `tool_search_tool_bm25` with search query, receives matching tool definitions
4. **Execution:** Discovered tools called via normal `tool_use` blocks
5. **Processing:** Our `executeTool` handler processes them unchanged

**IMPORTANT:** The `tool_search_tool_bm25` must be explicitly added to the tools array - it is NOT automatically provided by the API.

### Core Tools (Never Deferred)

These tools require immediate availability:

| Tool | Reason |
|------|--------|
| `memory` | Auto-context feature requires immediate availability |
| `code_execution` | PTC container lifecycle requires immediate availability |
| `summarize` | Conversation summarization |

### Graceful Degradation

- If model doesn't support tool search, falls back to all-tools-in-context
- Warning logged when fallback occurs
- No user-facing errors from tool search configuration

### Observability

```typescript
// Langfuse event for token savings
langfuse.event({
  name: 'tool_search.tokens_saved',
  metadata: {
    deferredToolCount,
    coreToolCount,
    estimatedTokenSavings,
    model,
  },
});

// Log when fallback occurs
logger.warn({
  event: 'tool_search.fallback',
  model,
  reason: 'Model does not support tool search',
});
```

### File Locations

| File | Purpose |
|------|---------|
| `src/config/environment.ts` | TOOL_SEARCH_ENABLED, CORE_TOOLS config |
| `src/tools/registry.ts` | defer_loading annotation, getCoreTool() |
| `src/agent/model-capabilities.ts` | supportsToolSearch() detection |
| `src/agent/loop.ts` | Tool search integration + observability |

---

## Tool Status Message Guidelines (Story 8.5)

### Format

Status messages during tool execution use a standardized format:

```
{Action Verb} {Tool Name} - "{context}"
```

Or without context:

```
{Action Verb} {Tool Name}
```

### Action Verbs

| Action | Verb | Use For |
|--------|------|---------|
| `search` | Searching | Search/query operations |
| `call` | Calling | API calls |
| `execute` | Executing | Code execution |
| `analyze` | Analyzing | Document/data analysis |
| `generate` | Generating | File/report generation |
| `fetch` | Fetching | Data retrieval |

### Examples

```
Searching MSCI Reports - "revenue trends"
Calling Audience Manager - "segment lookup"
Executing code - "generating Excel report"
Analyzing document - "Q4_summary.pdf"
Generating report - "weekly metrics"
Fetching data - "user preferences"
```

### Module Usage

```typescript
import { formatToolSummary, inferActionFromToolName } from '../tools/tool-summary.js';

// With context
formatToolSummary({ toolName: 'MSCI Reports', action: 'search', context: 'Hulu Q3 revenue' })
// => 'Searching MSCI Reports - "Hulu Q3 revenue"'

// Without context
formatToolSummary({ toolName: 'API', action: 'call' })
// => 'Calling API'

// Auto-infer action from tool name
const action = inferActionFromToolName('search_reports'); // => 'search'
```

### Forbidden Content in Status Messages

- Python import statements (`import pandas as pd`)
- Stack traces or error details
- Debug/verbose logging output (`DEBUG:`, `[DEBUG]`, `VERBOSE:`)
- Raw stdout from code execution
- Internal file paths (`File "/app/script.py"`)
- REPL artifacts (`>>> `, `... `)

### Output Sanitization

Code execution output MUST be filtered through `sanitizeCodeOutput()` before display:

```typescript
import { sanitizeCodeOutput } from '../tools/output-sanitizer.js';

const cleanOutput = sanitizeCodeOutput(rawPythonOutput);
// Filters: imports, stack traces, debug statements, REPL artifacts
```

### Error Humanization

Technical errors MUST be converted to user-friendly messages:

```typescript
import { humanizeError } from '../tools/error-humanizer.js';

const { userMessage, technicalDetails, errorType } = humanizeError(error);
// Log technicalDetails, show userMessage to user
```

| Technical Error | User-Friendly Message |
|-----------------|----------------------|
| `ModuleNotFoundError` | "The requested operation requires a capability that isn't available." |
| `TimeoutError` | "This operation took too long. Try simplifying your request." |
| `PermissionError` | "I don't have access to that resource." |
| `ConnectionError` | "Couldn't connect to the external service." |
| Unknown | "Something went wrong. I'll try a different approach." |

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
| `betas: ['single-beta']` | `betas: config.anthropic.allBetas` |
| New container every turn | Reuse via `containerLifecycle` |
| `type: 'code_execution'` | `type: 'code_execution_20250825'` |
| GKE for simple code | Use PTC (Anthropic container) |
| Show `import pandas` in status | Filter with `sanitizeCodeOutput()` |
| Display raw stack traces | Use `humanizeError()` for user message |
| Ad-hoc status message strings | Use `formatToolSummary()` |
| Log user-friendly errors | Log `technicalDetails`, show `userMessage` |

