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
last_updated: '2026-01-09'
course_correction: 'Claude Agent SDK → Direct Anthropic API (2025-12-22); MCP SDK adoption (2025-12-31); GKE Agent Sandbox for code execution (2026-01-03); Anthropic Skills + Files API adoption, GKE becomes fallback (2026-01-07); Epic 8 repurposed for Anthropic API Enhancements (2026-01-09)'
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
| Code Execution | FR19-23 | On-the-fly code generation, sandboxed execution, API calls *(FR20-22 MVP, FR19/23 Phase 2)* |
| Extensions | FR24-29 | Skills, Commands, MCP servers — composable tool layer |
| Knowledge | FR30-34 | Q&A, troubleshooting, domain-specific recommendations |
| Observability | FR35-40 | Langfuse tracing, prompt versioning, cost tracking |
| Persistent Memory | FR44-46 | Cross-session memory via GCS, user/session scopes |
| Slack AI App | FR47-50 | Feedback buttons, dynamic status, error messaging |
| File Ingestion | FR51 | Slack file upload → Anthropic Files API → Claude context |

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

### Agent Skills Implementation (Progressive Disclosure)

Agent Skills is an open standard from [agentskills.io](https://agentskills.io/home) — folders of instructions, scripts, and resources that agents can discover and use.

**Three-Level Progressive Disclosure:**

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| **Level 1: Metadata** | Always (startup) | ~100 tokens/skill | `name` + `description` from YAML frontmatter |
| **Level 2: Instructions** | When triggered | Variable | Full SKILL.md body (read via execute_code) |
| **Level 3: Resources** | As needed | Unlimited | Bundled scripts executed in GKE sandbox |

**Implementation pattern:**

```typescript
// Load ONLY metadata from .skills/ directory
async function loadSkillMetadata(): Promise<SkillMetadata[]> {
  const skillDirs = await glob('.skills/*/SKILL.md');
  return Promise.all(skillDirs.map(parseSkillFrontmatterOnly));
}

// System prompt contains ONLY hints (~100 tokens/skill)
function buildSkillsHint(skills: SkillMetadata[]): string {
  const hints = skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
  
  return `# Available Skills

${hints}

When a task matches a skill's description, read the full instructions:
  execute_code({ code: "cat /skills/{skill-name}/SKILL.md" })

Then follow the instructions in that file.`;
}
```

**Key Principle:** System prompt contains metadata only. Full content loaded on-demand via `execute_code` reading from sandbox filesystem (`/skills/`). This follows the pattern used by Cursor, Claude Code, and VS Code.

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

**Beta Headers Required:**
```typescript
// See consolidated beta configuration (lines 538-544):
betas: config.anthropic.allBetas  // All 5 required betas
```

**Rationale:** Prevents outdated lists. Single source of truth at lines 538-544.

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

## GKE Agent Sandbox for Code Execution (ADR-2026-01-03)

### Context

The original architecture planned to use Anthropic's Agent Skills feature for custom skills with code execution. Research revealed a critical limitation:

> **Anthropic's code execution container has NO network access.**

This blocks:
- Custom skills that call MCP tools
- External API calls from generated code
- Programmatic tool calling patterns

### Decision

**Adopt GKE Agent Sandbox** as a self-managed code execution environment.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Orion Slack Agent (Cloud Run)                                  │
│                                                                 │
│  ┌──────────┐    ┌────────────────────────────────────────────┐│
│  │ Claude   │───►│  execute_code Tool                         ││
│  │ (API)    │◄───│                                            ││
│  └──────────┘    │  ┌──────────────────────────────────────┐  ││
│                  │  │  GKE Agent Sandbox (us-central1)     │  ││
│                  │  │                                      │  ││
│                  │  │  • Python 3.11 runtime               │  ││
│                  │  │  • Network access ✅                 │  ││
│                  │  │  • MCP tool calls ✅                 │  ││
│                  │  │  • External APIs ✅                  │  ││
│                  │  │  • gVisor isolation                  │  ││
│                  │  └──────────────────────────────────────┘  ││
│                  └────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Infrastructure Details

| Component | Value |
|-----------|-------|
| **GCP Project** | `ai-workflows-459123` |
| **Cluster** | `orion-sandbox-cluster` |
| **Region** | `us-central1` |
| **Controller** | `agent-sandbox-controller-0` (namespace: `agent-sandbox-system`) |
| **Template** | `python-runtime-template` |
| **Warm Pool** | `orion-sandbox-warmpool` (2 replicas, sub-second startup) |
| **Router** | `sandbox-router-svc:8080` (2 replicas) |
| **Isolation** | gVisor (GKE Autopilot default) |

### Python Client Integration

```python
from agentic_sandbox import SandboxClient

with SandboxClient(
    template_name='python-runtime-template',
    namespace='default'
) as sandbox:
    result = sandbox.run('python3 -c "import urllib.request; ..."')
    # result.stdout, result.stderr available
```

### Verification (2026-01-03)

| Test | Result |
|------|--------|
| Python execution (`2+2`) | ✅ `4` |
| Socket connectivity (8.8.8.8:53) | ✅ `CONNECTED` |
| HTTP request (httpbin.org) | ✅ `HTTP 200` |

### Rationale

| Option | Verdict |
|--------|---------|
| **Anthropic's container** | ❌ No network access |
| **Local execution** | ❌ Security risk, no isolation |
| **GKE Agent Sandbox** | ✅ Network + isolation + control |

### Cost

~$70-150/month (GKE Autopilot auto-scaling)

### Files

```
infra/gke-sandbox/
├── sandbox-template-and-pool.yaml  # SandboxTemplate + WarmPool
├── sandbox-router.yaml              # Router Deployment + Service
└── README.md                         # Operational docs
```

### Status

- **Decision Date:** 2026-01-03
- **Status:** Deployed & Verified → **Demoted to Fallback (2026-01-07)**
- **Implementation:** `src/tools/gke-sandbox/` — fallback for webapp-testing, web-artifacts-builder only
- **Reference:** `_bmad-output/sprint-change-proposal-2026-01-03-gke-agent-sandbox.md`

---

## Anthropic Skills + Files API Adoption (ADR-2026-01-07)

### Context

After implementing GKE Agent Sandbox (ADR-2026-01-03), we discovered that Anthropic's code execution container supports **Skills + PTC + MCP together** via `allowed_callers`. This eliminates the need for GKE for most use cases.

**Key Insight:** "No network access" in Anthropic's container means no arbitrary HTTP calls. But MCP tool calls via `allowed_callers` ARE supported because **Anthropic routes them** — they don't go over the network from inside the container.

### Decision

**Adopt Anthropic Skills API + Files API** as primary skill execution environment. GKE sandbox becomes fallback for edge cases only (previously GKE was primary).

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Orion Slack Agent (Cloud Run)                                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    ANTHROPIC API                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │           CODE EXECUTION CONTAINER                  │  │  │
│  │  │                                                    │  │  │
│  │  │  ┌─────────────────┐  ┌─────────────────────────┐ │  │  │
│  │  │  │  Custom Skills  │  │  PTC (code_execution)   │ │  │  │
│  │  │  │  (Skills API)   │  │  + allowed_callers      │ │  │  │
│  │  │  └────────┬────────┘  └───────────┬─────────────┘ │  │  │
│  │  │           └───────────┬───────────┘               │  │  │
│  │  │                       ▼                           │  │  │
│  │  │             MCP Tools (Anthropic routes)          │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  FILES API                                          │  │  │
│  │  │  - Download generated files (xlsx, pdf, pptx)      │  │  │
│  │  │  - Upload input files for processing               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GKE SANDBOX (FALLBACK ONLY)                              │  │
│  │  - webapp-testing (Playwright + local servers)           │  │
│  │  - web-artifacts-builder (local filesystem builds)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### What Changes

| Component | Before (GKE Was Primary) | After (Anthropic Primary, GKE Fallback) |
|-----------|--------------------------|------------------------------------------|
| **Skill Storage** | `.skills/` baked into Docker | Uploaded via Skills API |
| **Skill Reference** | Filesystem path | `skill_id` from API |
| **Skill Loading** | `orion_sandbox({ skill_doc })` | `container: { skills: [...] }` |
| **Generated Files** | stdout parsing | Files API download |
| **Container Lifecycle** | Per-execution SandboxClaim | Reusable `container.id` |
| **Beta Headers** | `code-execution-2025-08-25` | + `skills-2025-10-02`, `files-api-2025-04-14` |

### Skills Migration

| Skill | Destination | Reason |
|-------|-------------|--------|
| xlsx, pdf, docx | Anthropic built-in | Use Anthropic's versions |
| summarize, algorithmic-art, skill-creator, frontend-design, mcp-builder, d3js-visualization, example | Anthropic custom | Upload via Skills API |
| webapp-testing, web-artifacts-builder | GKE (keep) | Need Playwright / local filesystem |

### New Files

| File | Purpose |
|------|---------|
| `src/services/skills-api.ts` | Skills API client |
| `src/services/files-api.ts` | Files API client |
| `src/services/skill-registry.ts` | Map skill names → skill_ids |
| `.orion/skills.yaml` | Skill ID configuration |
| `scripts/upload-skills.ts` | CI/CD skill upload script |

### Rationale

| Option | Verdict |
|--------|---------|
| **Keep GKE as primary (status quo before migration)** | ❌ Unnecessary complexity for 90% of use cases |
| **Anthropic primary + GKE fallback** | ✅ **ADOPTED** - Best of both worlds |
| **Drop GKE entirely** | ❌ Blocks webapp-testing, web-artifacts-builder |

### Benefits

- No K8s lifecycle management for most skills
- No port-forward issues on local dev
- Lower latency (Anthropic manages container)
- Container reuse across conversation turns
- Generated files via clean Files API
- Skills versioning via Anthropic API

### Status

- **Decision Date:** 2026-01-07
- **Status:** Approved
- **Implementation:** Epic 6 Stories 6.2-6.13
- **Reference:** `sprint-change-proposal-2026-01-07-skills-migration-to-anthropic.md`, `tech-spec-skills-migration-to-anthropic-container.md`

### Implementation Details (Added 2026-01-07)

#### Beta Headers (Consolidated)

All beta headers are consolidated in `config.anthropic.allBetas`:

```typescript
// src/config/environment.ts
anthropic: {
  allBetas: [
    'context-management-2025-06-27', // Memory tool auto-context
    'advanced-tool-use-2025-11-20',  // PTC - Programmatic Tool Calling
    'code-execution-2025-08-25',     // Skills execution + container
    'skills-2025-10-02',             // Skills API CRUD operations
    'files-api-2025-04-14',          // File downloads from container
  ],
}
```

**Rule:** Always use `config.anthropic.allBetas` in `messages.create()`. Never construct beta arrays inline.

#### PTC Tool Definition

```typescript
// src/agent/loop.ts - EXACT format required
const codeExecutionTool = {
  type: 'code_execution_20250825' as const,
  name: 'code_execution',
};

// Add to tools array (type assertion required due to SDK types)
const tools = [
  ...mcpTools,
  codeExecutionTool as unknown as Anthropic.Tool,
  ...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
];
```

#### Container Parameter Structure

```typescript
// src/skills/container-builder.ts
interface ContainerParameter {
  id?: string;           // Reuse existing container (cross-turn)
  skills: string[];      // Array of skill IDs (skl_xxx)
  allowed_callers?: AllowedCaller[];  // MCP tools callable from code
}

// Build with skills
const container = buildContainerParameter(['skl_abc123', 'skl_def456']);
// Result: { skills: ['skl_abc123', 'skl_def456'], allowed_callers: [...mcpTools] }

// Reuse across conversation turns
container.id = existingContainerId;
```

#### Container Lifecycle Management

```typescript
// src/skills/container-lifecycle.ts - SINGLETON
class ContainerLifecycleManager {
  private containers = new Map<string, { id: string; lastUsed: number }>();

  getContainerId(threadTs: string): string | undefined;
  setContainerId(threadTs: string, containerId: string): void;

  // Auto-cleanup: 30 min TTL, max 1000 entries (LRU)
}

export const containerLifecycle = new ContainerLifecycleManager();
```

**Usage in agent loop:**
```typescript
// Check for existing container (cross-request reuse)
const existingId = containerLifecycle.getContainerId(threadTs);
if (existingId) {
  container.id = existingId;
}

// After receiving new container ID from API
if (response.container?.id && !activeContainerId) {
  containerLifecycle.setContainerId(threadTs, response.container.id);
}
```

#### Skills API Client

```typescript
// src/skills/api-client.ts
class SkillsApiClient {
  // Create skill with .zip upload (SKILL.md + scripts/)
  async createSkill(name: string, description: string, files: SkillFile[]): Promise<{ skillId: string; versionId: string }>;

  // List all skills for account
  async listSkills(): Promise<ApiSkill[]>;

  // Get skill details
  async getSkill(skillId: string): Promise<ApiSkill>;

  // Update skill (new version)
  async updateSkill(skillId: string, files: SkillFile[]): Promise<{ versionId: string }>;

  // Delete skill
  async deleteSkill(skillId: string): Promise<void>;
}

export const skillsApi = new SkillsApiClient();
```

#### Skills API Lifecycle

**Upload Phase (Startup):**
1. `initializeSkills()` scans `.skills/` directory for SKILL.md files
2. For each skill:
   - Read SKILL.md metadata (name, description)
   - If `scripts/` exists, bundle into .zip with SKILL.md
   - Call `createSkill(name, description, files)` via Skills API
   - Store returned `skill_id` in memory registry
3. Compares with remote Skills API (`GET /skills`)
4. Uploads only new/changed skills (`POST /skills` with ZIP)
5. Caches `skill_id` mappings in memory

**Reference Phase (Per Message):**
1. `buildContainerParameter()` builds `{ skills: [skill_ids] }`
2. Check `containerLifecycle.getContainerId(threadTs)` for reuse
3. Pass `container` to `messages.create()`
4. Extract `container.id` from response for future reuse

**Container Reuse:**
- Each Slack thread (`threadTs`) maps to one `container.id`
- Container persists across conversation turns (30min TTL)
- Reuse eliminates skill reload overhead

**File Output:**
- PTC generates files → stored in container
- Download via Files API (`GET /files/{file_id}`)
- Upload to Slack via `uploadFilesToThread()`

**Code References:**
- See `src/skills/init.ts` (lines 1-50) for initialization
- See `src/skills/sync-service.ts` (lines 1-100) for upload logic
- See `src/skills/container-lifecycle.ts` for container reuse

#### Skill Sync at Startup

```typescript
// src/skills/init.ts
export async function initializeSkills(): Promise<void> {
  // 1. Load local .skills/ directory
  // 2. Compare with remote Skills API
  // 3. Upload new/changed skills
  // 4. Cache skill IDs in memory
}

// Called from src/index.ts during startup
await initializeSkills();
```

#### File Output Handling

```typescript
// PTC generates files → Files API retrieves them
// src/files/api-client.ts
class FilesApiClient {
  async downloadFile(fileId: string): Promise<{ content: Buffer; filename: string; mimeType: string }>;
  async listFiles(containerId: string): Promise<FileInfo[]>;
}

// In Slack handler (src/slack/handlers/user-message.ts)
if (result.generatedFileIds.length > 0) {
  for (const fileId of result.generatedFileIds) {
    const file = await filesApi.downloadFile(fileId);
    await slackClient.files.upload({
      channels: channelId,
      thread_ts: threadTs,
      file: file.content,
      filename: file.filename,
    });
  }
}
```

#### Files API Client

**Location:** `src/files/api-client.ts`

**Operations:**
- `getFile(fileId)` → Download generated file (blob)
- `getFileMetadata(fileId)` → Fetch file info (name, size, type)

**Integration Flow:**
1. PTC generates files → stored in container
2. Extract from `response.container.files: [{ id, name, type }]`
3. Download via `FilesApiClient.getFile(fileId)` → Blob
4. Upload to Slack via `slackFileUploader.uploadFilesToThread()`

**Supported Formats:**
- **Built-in (Anthropic):** xlsx, pdf, docx, pptx
- **Custom Skills:** png, jpg, svg (image generation)
- **Data Exports:** csv, json, txt

**Limitations:**
- Max file size: 100MB per file
- Retention: 7 days from generation
- Download requires `file_id` from `container.files` response

**Code Reference:** See `src/files/api-client.ts` (lines 1-80)

#### Observability

```typescript
// Langfuse events for container lifecycle
langfuse.event({
  name: 'container.lifecycle.create',  // New container spun up
  metadata: { threadTs, containerId, skillCount }
});

langfuse.event({
  name: 'container.lifecycle.reuse',   // Reused from previous turn
  metadata: { threadTs, containerId, hasSkills: true }
});

// Log structure for PTC calls
logger.debug({
  event: 'agent.loop.ptc_tool_call',
  traceId,
  ptcCallNumber: ptcToolCallCount,
  containerId: activeContainerId,
  skillsLoaded: skillIds.length,
});
```

#### Model Compatibility

| Model | PTC Support | Skills Support | Notes |
|-------|-------------|----------------|-------|
| claude-sonnet-4-20250514 | ✅ Full | ✅ Full | Primary model |
| claude-3-5-sonnet-20241022 | ⚠️ Limited | ⚠️ Limited | May not support all features |
| claude-3-opus-20240229 | ❌ No | ❌ No | Use GKE sandbox |

#### File Structure (Final)

```
src/
├── skills/
│   ├── index.ts                    # Re-exports
│   ├── types.ts                    # SkillFile, ApiSkill, ContainerParameter
│   ├── api-client.ts               # Skills API CRUD
│   ├── api-client.test.ts
│   ├── container-builder.ts        # buildContainerParameter()
│   ├── container-builder.test.ts
│   ├── container-lifecycle.ts      # Singleton lifecycle manager
│   ├── container-lifecycle.test.ts
│   ├── sync-service.ts             # .skills/ → API sync
│   ├── sync-service.test.ts
│   ├── init.ts                     # Startup initialization
│   └── runtime.ts                  # Legacy skill loading (deprecated)
├── files/
│   ├── api-client.ts               # Files API download
│   └── api-client.test.ts
scripts/
└── upload-skills.ts                # CI/CD upload script
```

---

## Epic 8 Repurposed: Anthropic API Enhancements (ADR-2026-01-09)

### Context

Epic 8 was originally reserved for Phase 2 code generation patterns (FR19, FR23). Based on user feedback and Anthropic API maturity, Epic 8 is repurposed for Anthropic's latest API features that enhance response quality and scalability.

### Decision

**Repurpose Epic 8** from "Code Generation (Phase 2)" to "Anthropic API Enhancements":

| Story | Feature | Priority |
|-------|---------|----------|
| 8.1 | Anthropic Citations API Integration | P1 |
| 8.2 | Tool Search Tool Integration | P2 |
| 8.3 | Slack File Ingestion for Claude Context | P1 |
| 8.4 | MCP Auth Fix for PTC Integration | P1 |

### Implementation Details

#### 8.1 Citations API

**Purpose:** Enable verifiable source references in responses.

```typescript
// Enable citations on document content blocks
const message = await anthropic.messages.create({
  model: config.anthropic.model,
  messages,
  // Citations is GA — no beta header required
});

// Document blocks with citations enabled
const documentBlock = {
  type: 'document',
  source: {
    type: 'text',
    media_type: 'text/plain',
    data: documentContent,
  },
  citations: { enabled: true },  // ← Enable citations
};
```

**Constraints:**
- GA feature (no beta header required)
- **Incompatible with Structured Outputs** — cannot use both simultaneously
- Citation blocks returned in `response.content` array

**Slack Integration:**
- Parse citation blocks from response
- Format as inline references: `[1]`, `[2]`
- Add citation footer block with source details

#### 8.2 Tool Search Tool

**Purpose:** Reduce token usage when 100s of MCP tools available by lazy-loading tools on demand.

```typescript
// Beta header required (already in allBetas)
betas: ['advanced-tool-use-2025-11-20', ...]

// Configure MCP tools for deferred loading
const mcpTool = {
  name: 'confluence_search',
  description: 'Search Confluence documentation',
  defer_loading: true,  // ← Claude discovers on demand
  input_schema: { ... },
};

// Always-loaded tools (no defer_loading)
const coreTools = ['memory', 'web_search', 'code_execution'];
```

**Model Requirements:**
- Sonnet 4.5+ (`claude-sonnet-4-20250514`) or Opus 4.5+
- Older models do not support tool search

**Observability:**
- Track token savings in Langfuse: `tool_search.tokens_saved`
- Log which tools were discovered vs. always loaded

#### 8.3 Slack File Ingestion (FR51)

**Purpose:** Allow users to upload files in Slack that Claude can read and analyze.

```typescript
// Detect files in Slack message
if (message.files && message.files.length > 0) {
  for (const file of message.files) {
    // 1. Download from Slack
    const content = await slackClient.files.info({ file: file.id });
    const fileBuffer = await downloadSlackFile(content.file.url_private_download);

    // 2. Upload to Anthropic Files API
    const anthropicFile = await filesApi.upload({
      file: fileBuffer,
      purpose: 'assistants',
    });

    // 3. Reference in message as document block
    documentBlocks.push({
      type: 'document',
      source: {
        type: 'file',
        file_id: anthropicFile.id,
      },
      citations: { enabled: true },  // Pair with Citations (8.1)
    });
  }
}
```

**Supported Formats:**
| Format | Extension | Max Size |
|--------|-----------|----------|
| PDF | `.pdf` | 100MB |
| Images | `.png`, `.jpg`, `.gif` | 20MB |
| CSV | `.csv` | 100MB |
| Text | `.txt`, `.md`, `.json` | 100MB |

**Flow:**
1. User uploads file in Slack message
2. Orion detects `files` array in event
3. Download file via Slack API (`files.info` → `url_private_download`)
4. Upload to Anthropic Files API (reuse Story 6.5 client)
5. Include as document block with `file_id`
6. Claude reads and analyzes file content

#### 8.4 MCP Auth Fix for PTC

**Purpose:** Fix authentication bugs for MCP servers accessed via Programmatic Tool Calling.

**Bug 1: No-Auth MCP Servers**
```typescript
// Problem: MCP servers with headers: {} fail via PTC
// Solution: Ensure empty auth context is properly passed

// Before (broken)
allowed_callers: [{ tool_name: 'exa_search' }]

// After (fixed)
allowed_callers: [{
  tool_name: 'exa_search',
  auth_context: {},  // Explicit empty auth
}]
```

**Bug 2: GCP Identity Auth**
```typescript
// Problem: authType: 'gcp_identity' not forwarded through PTC
// Solution: Pass identity token in allowed_callers

allowed_callers: [{
  tool_name: 'audience_manager_search',
  auth_context: {
    type: 'bearer',
    token: await getGcpIdentityToken(),
  },
}]
```

**Affected MCP Servers:**
- `audience-manager` (GCP Identity)
- `msci-reports` (GCP Identity)
- `exa` (no auth)

### Rationale

| Option | Verdict |
|--------|---------|
| Keep Epic 8 for Phase 2 code gen | ❌ Lower priority; code gen works naturally |
| Repurpose for Anthropic API features | ✅ **ADOPTED** — Immediate user value |

### Status

- **Decision Date:** 2026-01-09
- **Status:** Approved
- **Implementation:** Epic 8 Stories 8.1-8.4
- **Reference:** `sprint-change-proposal-2025-01-09.md`

---

## StatusUpdater Abstraction (Story 7.9)

### Context

The two Slack handlers implement status updates differently:

| Handler | Status API | Debounce | Cleanup |
|---------|------------|----------|---------|
| `user-message.ts` | `setStatus()` | None (Slack handles) | `setStatus('')` |
| `app-mention.ts` | `chat.postMessage/update/delete` | 300ms manual | `chat.delete()` |

This creates code duplication and testing complexity.

### Decision

**Introduce `StatusUpdater` interface** with two implementations and a factory.

### Architecture

```
StatusUpdater (interface)
├── update(status: string): Promise<void>
├── cleanup(): Promise<void>
└── isActive(): boolean

AssistantStatusUpdater
├── Wraps setStatus() from Assistant API
├── cleanup() calls setStatus('')
└── No debouncing (Slack handles)

ChannelStatusUpdater
├── Uses chat.postMessage/update/delete
├── 300ms debounce on updates
├── cleanup() deletes status message
└── Tracks messageTs for updates

createStatusUpdater(context)
├── If context.setStatus exists → AssistantStatusUpdater
└── Else → ChannelStatusUpdater
```

### File Structure

```
src/slack/status/
├── types.ts              # StatusUpdater interface
├── assistant-updater.ts  # wraps setStatus()
├── channel-updater.ts    # post/update/delete with debounce
├── index.ts              # factory + re-exports
└── index.test.ts         # unit tests
```

### Implementation

```typescript
// src/slack/status/types.ts
export interface StatusUpdater {
  update(status: string): Promise<void>;
  cleanup(): Promise<void>;
  isActive(): boolean;
}

export interface StatusContext {
  setStatus?: (payload: { status: string; loading_messages?: string[] }) => Promise<void>;
  client: WebClient;
  channel: string;
  thread_ts: string;
}

// src/slack/status/index.ts
export function createStatusUpdater(context: StatusContext): StatusUpdater {
  if (context.setStatus) {
    return new AssistantStatusUpdater(context.setStatus);
  }
  return new ChannelStatusUpdater(context.client, context.channel, context.thread_ts);
}
```

### Usage in Handlers

```typescript
// Before (user-message.ts) — inline implementation
const safeSetStatus = (payload: unknown): Promise<void> => { ... };
await safeSetStatus({ status: 'working...', loading_messages: [...] });

// After — unified abstraction
const statusUpdater = createStatusUpdater({ setStatus, client, channel, thread_ts });
await statusUpdater.update('working...');
// ... agent processing ...
await statusUpdater.cleanup();
```

### Benefits

- **Unified interface** — Same API for both handler types
- **Testability** — Mock `StatusUpdater` interface in unit tests
- **Maintainability** — Status logic isolated in single module
- **Type safety** — TypeScript enforces correct usage

### Status

- **Decision Date:** 2026-01-09
- **Status:** Approved
- **Priority:** P3
- **Estimate:** 1-2 hours
- **Reference:** `implementation-readiness-report-2026-01-09.md`

---

## Code Execution Architecture

Orion's code execution follows a **primary-fallback pattern** established in ADR-2026-01-07.

### Primary: Anthropic Skills API + PTC

**What it is:**
- **Skills:** Custom capabilities uploaded via Skills API (`.skills/` directory)
- **PTC (Programmatic Tool Calling):** On-the-fly code generation using `code_execution_20250825` tool
- **Container:** Anthropic-managed execution environment with pre-loaded skills
- **MCP Access:** Skills can call MCP tools via `allowed_callers` (Anthropic routes them)
- **File Output:** Generated files downloaded via Files API

**When to use:**
- 90% of code execution use cases
- Skills with MCP tool dependencies (e.g., summarize, mcp-builder, skill-creator)
- Data processing, file generation (xlsx, pdf, docx), API orchestration
- Any task that doesn't require browser automation or local filesystem

**Architecture:**
```
┌─────────────────────────────────────────┐
│  Slack Thread                           │
│  ├─ User: "Analyze this data"          │
│  └─ Orion: Calls Anthropic Messages API │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Anthropic Messages API                 │
│  ┌─────────────────────────────────┐   │
│  │  Code Execution Container       │   │
│  │  ├─ Skills (pre-loaded)         │   │
│  │  ├─ PTC (dynamic code)          │   │
│  │  └─ MCP Tools (via allowed_     │   │
│  │     callers, routed by Anthropic)│   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  Files API                       │   │
│  │  └─ Download generated files     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Benefits:**
- No infrastructure management (Anthropic manages container)
- Container reuse across conversation turns (30min TTL)
- Lower latency vs cold starts
- Skills versioning via API
- Clean file downloads via Files API

**See:** ADR-2026-01-07 (lines 428-791) for full implementation details.

### Fallback: GKE Agent Sandbox

**What it is:**
- Kubernetes-based Python execution environment
- Full filesystem access and network capabilities
- Playwright browser automation support

**When to use (edge cases only):**
- Browser automation requiring Playwright (`webapp-testing`)
- Local HTTP server execution for build artifacts (`web-artifacts-builder`)
- Tasks requiring direct filesystem access beyond Anthropic container capabilities

**Retained Skills:**
- `webapp-testing` — Playwright browser automation
- `web-artifacts-builder` — Local filesystem builds

**Cost:** ~$35-75/month (1 replica warm pool, reduced from 2 replicas after Skills migration)

**Infrastructure:** GKE cluster `orion-sandbox-cluster` in `us-central1`

**See:** `infra/gke-sandbox/README.md` for setup details.

### Execution Decision Tree

```
User requests code execution
  │
  ├─ Requires browser automation (Playwright)?
  │  └─ YES → GKE Sandbox (webapp-testing)
  │
  ├─ Requires local filesystem builds?
  │  └─ YES → GKE Sandbox (web-artifacts-builder)
  │
  └─ Everything else → Anthropic Skills + PTC
```

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
2. Use SDK helper: `betaMemoryTool(handlers)` from `@anthropic-ai/sdk/helpers/beta/memory`
3. Tool type is `memory_20250818` (set automatically by helper)
4. Claude auto-checks `/memories` directory before tasks
5. Claude makes tool calls with 6 commands: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`
6. Your handler executes operations against GCS with formatted responses

**SDK Helper Usage:**

```typescript
import { betaMemoryTool, MemoryToolHandlers } from '@anthropic-ai/sdk/helpers/beta/memory';

const handlers: MemoryToolHandlers = {
  view: async (cmd) => formatViewResponse(await gcsRead(cmd.path)),
  create: async (cmd) => { await gcsWrite(cmd.path, cmd.file_text); return `File created at: ${cmd.path}`; },
  str_replace: async (cmd) => strReplaceInFile(cmd.path, cmd.old_str, cmd.new_str),
  insert: async (cmd) => insertAtLine(cmd.path, cmd.insert_line, cmd.insert_text),
  delete: async (cmd) => { await gcsDelete(cmd.path); return `Successfully deleted ${cmd.path}`; },
  rename: async (cmd) => { await gcsMove(cmd.old_path, cmd.new_path); return `Renamed ${cmd.old_path} to ${cmd.new_path}`; },
};

const memoryTool = betaMemoryTool(handlers);
// memoryTool.type === 'memory_20250818'
// memoryTool.name === 'memory'
```

**Response Format Requirements:**

- Directories: `{size}\t{path}` per line (e.g., `5.5K\t/memories/global/file.md`)
- Files: 6-char right-aligned line numbers, tab-separated (e.g., `     1\tHello World`)

### Memory Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD RUN CONTAINER                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Agent Loop (messages.create + tool_use)                │ │
│  │  └── Memory Tool (via betaMemoryTool SDK helper)         │ │
│  │      └── handler.ts (MemoryToolHandlers)                 │ │
│  │          ├── view(path)       → GCS list/read            │ │
│  │          ├── create(path)     → GCS write                │ │
│  │          ├── str_replace()    → GCS read/modify/write    │ │
│  │          ├── insert(line)     → GCS read/modify/write    │ │
│  │          ├── delete(path)     → GCS delete               │ │
│  │          └── rename(old,new)  → GCS copy+delete          │ │
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
| **Epic 1** | Foundation & Deployment | `src/slack/`, `docker/` | MVP |
| **Epic 2** | Agent Core Loop | `src/agent/` | MVP |
| **Epic 3** | Tool Connectivity (MCP) | `src/tools/mcp/` | MVP |
| **Epic 4** | ~~Subagents~~ REMOVED | N/A | Removed 2025-12-31 |
| **Epic 5** | Persistent Memory | `src/tools/memory/`, `src/memory/` | MVP |
| **Epic 6** | Skills & Extensions | `.skills/`, `src/skills/`, `src/tools/code-execution/` | MVP |
| **Epic 7** | Slack Polish | `src/slack/` (suggested prompts, summarization, status) | MVP |
| **Epic 8** | Anthropic API Enhancements | `src/files/`, `src/slack/handlers/` | Sprint 8 |

*Note: Observability is cross-cutting, implemented via `src/observability/` across all epics.*

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
├── .skills/                               # Agent Skills (agentskills.io standard)
│   └── example-skill/
│       ├── SKILL.md                       # Skill definition + instructions
│       └── scripts/                       # Optional executable scripts
│
├── orion/                                 # Orion configuration
│   └── workflows/                         # Workflow definitions
│       └── example.md
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
│   │   ├── code-execution/                # Epic 6: Code execution (GKE sandbox)
│   │   │   ├── tool.ts                    # execute_code tool
│   │   │   ├── tool.test.ts
│   │   │   ├── sandbox-client.ts          # GKE sandbox HTTP client
│   │   │   ├── sandbox-client.test.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   │
│   │   └── search/                        # Knowledge search
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
| FR19-23 (Code execution) | `src/tools/code-execution/*.ts` *(FR20-22 MVP, FR19/FR23 Phase 2)* |
| FR24-29 (Extensions) | `.skills/`, `src/skills/loader.ts` |
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
| Epic 3 | Tool Connectivity (MCP) | ✅ `src/tools/mcp/` |
| Epic 4 | ~~Subagents~~ | ❌ Removed 2025-12-31 |
| Epic 5 | Persistent Memory | ✅ `src/tools/memory/`, `src/memory/` |
| Epic 6 | Skills & Extensions | ✅ `.skills/`, `src/skills/`, `src/tools/code-execution/` |
| Epic 7 | Slack Polish | ✅ `src/slack/suggested-prompts.ts`, `src/slack/status/`, handlers |
| Epic 8 | Anthropic API Enhancements | ✅ `src/files/`, `src/slack/handlers/` (Citations, Tool Search, File Ingestion, MCP Auth) |

**Functional Requirements Coverage:** 51/51 FRs covered (FR1-46 + FR47-51)

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

**Last Updated:** 2026-01-09 — Added ADR for Epic 8 repurpose (Anthropic API Enhancements); added StatusUpdater abstraction (Story 7.9); added FR51 (File Ingestion).
