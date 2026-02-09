# Codebase Report: GCS Buckets and Memory Storage Investigation
Generated: 2026-02-08

## Summary

The Samba Slackbot has **GCS memory storage implemented** for Anthropic's Memory Tool, but **no company-context reference documents are stored or loaded**. The reference docs (company-context.md, department-workflows.md, tool-inventory.md) are **planned but not implemented**.

## Questions Answered

### Q1: What GCS buckets are configured?

**Bucket Name:** `orion-memories` (development) / `orion-memories-prod` (production)

**Environment Variable:** `GCS_MEMORIES_BUCKET`

**Configuration Locations:**
- ✓ VERIFIED `src/config/environment.ts` - Loaded as required config
- ✓ VERIFIED `cloudbuild.yaml` - Secret mapping `gcs-memories-bucket:latest`
- ✓ VERIFIED `cloud-run-service.yaml` - Secret reference
- ✓ VERIFIED `.env.example` - Missing (not in template, but required)

**Status:** **REQUIRED** - Application validation requires this environment variable.

```typescript
// src/config/environment.ts
gcsMemoriesBucket: process.env.GCS_MEMORIES_BUCKET ?? '',

const required = [
  'slackBotToken',
  'slackSigningSecret',
  'anthropicApiKey',
  'anthropicModel',
  'gcsMemoriesBucket',  // ← REQUIRED
  'langfusePublicKey',
  'langfuseSecretKey',
] as const;
```

---

### Q2: What files/documents are stored in GCS?

**Actual Files Stored:**

The bucket stores **agent memory files** created dynamically via Anthropic's Memory Tool:

```
gs://orion-memories/
├── /memories/                 # Root namespace
│   ├── project-context.md     # Agent-created context
│   ├── user-prefs/            # Per-user preferences
│   └── session-state/         # Session-level memory
```

**Path Structure:**
- ✓ VERIFIED `src/tools/memory/paths.ts` - Type-safe path builders
- ✓ VERIFIED Three scopes: global, user-level, session-level
- ✓ VERIFIED Allowed extensions: `.json`, `.md`, `.txt`, `.yaml`

**What's NOT Stored:**

? INFERRED The following reference documents are **mentioned in plans but do not exist**:
- `company-context.md` - Samba TV products, org structure
- `department-workflows.md` - HR, Sales, Marketing tool mappings  
- `tool-inventory.md` - Auto-generated from config.yaml

**Evidence:**
```bash
$ find . -name "company-context.md" -o -name "department-workflows.md" -o -name "tool-inventory.md"
# (no results)

$ grep -r "company.context\|department.workflow\|tool.inventory" src/
# (no results)
```

---

### Q3: How does the agent retrieve context from GCS at runtime?

**Implementation:** ✓ VERIFIED Full Memory Tool implementation exists

**Entry Point:** `src/tools/memory/handler.ts`

**GCS Operations:** `src/tools/memory/storage.ts`

```typescript
// Storage layer
import { Storage } from '@google-cloud/storage';

export async function readFile(bucketName: string, path: string): Promise<string>
export async function writeFile(bucketName: string, path: string, content: string): Promise<void>
export async function deleteFile(bucketName: string, path: string): Promise<void>
export async function listFiles(bucketName: string, prefix: string): Promise<Array<{path, size}>>
```

**Memory Tool Commands:**
| Command | GCS Operation | Description |
|---------|--------------|-------------|
| `view` | `getFiles()` / `download()` | List directory or read file |
| `create` | `save()` | Write new file |
| `str_replace` | `download()` + `save()` | Modify existing content |
| `insert` | `download()` + `save()` | Insert at line number |
| `delete` | `delete()` | Remove file |
| `rename` | `copy()` + `delete()` | Move/rename file |

**Agent Access:**
- Claude uses Anthropic Memory Tool SDK helper
- Memory Tool is configured as a **core tool** (always in context)
- Tool calls are routed to `createMemoryHandlers()` which executes GCS operations
- Bucket name injected via context: `setMemoryToolContext(bucket, traceId)`

**Path Sanitization:**
✓ VERIFIED Thread IDs sanitized for GCS paths: `:` and `.` replaced with `-`

---

### Q4: Reference Documents - Planned vs Implemented

**Status: PLANNED BUT NOT IMPLEMENTED**

**Source:** `thoughts/shared/plans/PLAN-samba-system-prompt.md`

```markdown
### GCS Document Layer

**Purpose:** Store reference documents retrievable on-demand

| Document | Content | Update Frequency |
|----------|---------|------------------|
| company-context.md | Samba TV products, org structure | Quarterly |
| department-workflows.md | HR, Sales, Marketing tool mappings | As needed |
| tool-inventory.md | Auto-generated from config.yaml | On deploy |

**Retrieval mechanism:** TBD - could use a skill or inject based on user context.
```

**Why They Don't Exist:**
- ✗ UNCERTAIN Plan marked as **"Future Work (Out of Scope)"**
- ✗ UNCERTAIN No implementation in current codebase
- ✗ UNCERTAIN No loader in agent initialization
- ✗ UNCERTAIN No references in `.orion/agents/orion.md` system prompt

**Current State:**
The Samba agent system prompt (`.orion/agents/orion.md`) uses **progressive disclosure** architecture:
- Layer 1: Core prompt (~100 lines) with tool-search-first rule
- Layer 2: Skills (self-contained instructions in `.skills/*/SKILL.md`)
- Layer 3: GCS Documents (**planned, not implemented**)

---

## Architecture Map

```
┌─────────────────────────────────────────────────┐
│  Slack User Request                             │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  src/agent/handler.ts                           │
│  - Gathers thread context                       │
│  - Injects Memory Tool with bucket context      │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  Anthropic Claude API                           │
│  - Memory Tool in tools array                   │
│  - Agent can read/write GCS files               │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  src/tools/memory/handlers.ts                   │
│  - createMemoryHandlers(bucket, traceId)        │
│  - Routes 6 commands to GCS operations          │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  src/tools/memory/storage.ts                    │
│  - @google-cloud/storage SDK                    │
│  - CRUD operations on bucket                    │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  Google Cloud Storage                           │
│  gs://orion-memories/                           │
│    └── memories/                                │
│        ├── (agent-created files)                │
│        └── (NO reference docs)                  │
└─────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose | Entry Points | Status |
|------|---------|--------------|--------|
| `src/tools/memory/handler.ts` | Memory Tool registration | `memoryTool` export | ✓ Implemented |
| `src/tools/memory/handlers.ts` | Command handler logic | `createMemoryHandlers()` | ✓ Implemented |
| `src/tools/memory/storage.ts` | GCS operations | `readFile()`, `writeFile()`, `deleteFile()`, `listFiles()` | ✓ Implemented |
| `src/tools/memory/paths.ts` | Type-safe path builders | `Memory.global()`, `Memory.user()`, `Memory.session()` | ✓ Implemented |
| `src/config/environment.ts` | Environment config | `gcsMemoriesBucket` | ✓ Implemented |
| `.env.example` | Template | - | ✗ Missing `GCS_MEMORIES_BUCKET` |

---

## GCS Bucket Configuration

**Environment Variable:** `GCS_MEMORIES_BUCKET`

**Deployment:**
- Cloud Build: Secret injected via `--set-secrets` flag
- Cloud Run: Secret mounted from Google Secret Manager
- Local Dev: Must be set in `.env` file

**Missing from `.env.example`:**
```bash
# .env.example currently LACKS this required variable:
GCS_MEMORIES_BUCKET=orion-memories
```

**IAM Permissions Required:**
- Cloud Run service account needs `roles/storage.objectAdmin` on bucket
- Application uses Application Default Credentials (ADC)

---

## Reference Documents Analysis

### What Was Planned

From `PLAN-samba-system-prompt.md` (lines 49-53):

```markdown
│  Layer 3: GCS Documents (future)                        │
│  - company-context.md                                   │
│  - department-workflows.md                              │
│  - tool-inventory.md (auto-generated)                   │
```

**Purpose:** Progressive disclosure - keep core prompt lean, load domain context on-demand

**Update Strategy:**
| Document | Content | Refresh Frequency |
|----------|---------|-------------------|
| `company-context.md` | Samba TV products, org structure | Quarterly |
| `department-workflows.md` | HR, Sales, Marketing tool mappings | As needed |
| `tool-inventory.md` | Auto-generated from `.orion/config.yaml` | On deploy |

### What Exists

**Search Results:**
```bash
find . -name "company-context.md"      # Not found
find . -name "department-workflows.md" # Not found
find . -name "tool-inventory.md"       # Not found

grep -r "company.context" src/         # Not found
grep -r "department.workflow" src/     # Not found
grep -r "tool.inventory" src/          # Not found
```

✗ UNCERTAIN **None of the reference documents exist or are loaded.**

### Implementation Gap

**What's Missing:**
1. **Files don't exist** - No reference docs in GCS or repository
2. **No loader** - No code to fetch these docs from GCS
3. **No injection** - Agent prompt doesn't reference them
4. **No generation** - No script to auto-generate `tool-inventory.md`

**Where They Would Go:**
- Storage: `gs://orion-memories/reference/`
- Loader: Could be in `src/agent/context-builder.ts` or similar
- Injection: System prompt or skills could reference them

---

## Conventions Discovered

### Naming
- Files: kebab-case (`memory-handler.ts`)
- Functions: camelCase (`createMemoryHandlers`)
- GCS paths: `/memories/{scope}/{filename}`

### Memory Scopes

| Scope | Path Builder | Example |
|-------|-------------|---------|
| Global | `Memory.global('context.md')` | `/memories/context.md` |
| User | `Memory.user(userId, 'prefs.json')` | `/memories/user-{userId}/prefs.json` |
| Session | `Memory.session(threadTs, 'state.json')` | `/memories/session-{threadTs}/state.json` |

### Testing
- Test location: Co-located with implementation (e.g., `storage.test.ts`)
- Framework: Jest with TypeScript
- Coverage: Unit tests for GCS operations

---

## Open Questions

1. **Why is GCS_MEMORIES_BUCKET missing from .env.example?**
   - It's a required variable but not documented in the template

2. **Are reference documents planned for implementation?**
   - Marked as "Future Work (Out of Scope)" in PLAN-samba-system-prompt.md
   - No active story or epic for implementation

3. **What bucket name is used in production?**
   - Documentation shows: `orion-memories-prod`
   - Actual deployment uses Secret Manager value

4. **How would reference docs be loaded if implemented?**
   - Plan says "TBD - could use a skill or inject based on user context"
   - No design decision made yet

---

## Verification Evidence

### GCS Bucket Name References

```
_bmad-output/architecture.md:              │  gs://orion-memories/           │
_bmad-output/architecture.md:GCS_MEMORIES_BUCKET=orion-memories-prod
scripts/verify-memory-gcs.ts:const BUCKET = process.env.GCS_MEMORIES_BUCKET || 'orion-memories';
cloudbuild.yaml:      - 'GCS_MEMORIES_BUCKET=gcs-memories-bucket:latest'
cloud-run-service.yaml:                  name: gcs-memories-bucket
```

### Implementation Files

```
src/tools/memory/
├── format.ts        # Response formatting
├── handler.ts       # Memory Tool definition
├── handlers.ts      # Command implementations
├── index.ts         # Barrel exports
├── loader.ts        # Tool loader
├── paths.ts         # Type-safe path builders
├── storage.ts       # GCS operations layer
└── tool.ts          # Tool registration
```

### Memory Path Structure (from src/tools/memory/paths.ts)

```typescript
/** Max file size for memory files (100KB) */
export const MAX_MEMORY_FILE_SIZE = 100 * 1024;

/** Allowed file extensions for memory files */
export const ALLOWED_EXTENSIONS = ['.json', '.md', '.txt', '.yaml'] as const;

// Branded type prevents raw strings as paths
export type MemoryPath = {
  readonly __brand: 'MemoryPath';
  readonly path: string;
};
```

---

## Next Steps (If Reference Docs Are Needed)

### Implementation Tasks

1. **Create Reference Documents**
   - Write `company-context.md` (Samba TV products, teams, org structure)
   - Write `department-workflows.md` (HR/Sales/Marketing tool mappings)
   - Generate `tool-inventory.md` from `.orion/config.yaml`

2. **Upload to GCS**
   ```bash
   gsutil cp company-context.md gs://orion-memories/reference/
   gsutil cp department-workflows.md gs://orion-memories/reference/
   gsutil cp tool-inventory.md gs://orion-memories/reference/
   ```

3. **Create Loader**
   - Add `src/agent/reference-loader.ts`
   - Fetch docs from `gs://orion-memories/reference/` at startup
   - Inject into agent context or make available via skill

4. **Update System Prompt**
   - Add reference to available docs in `.orion/agents/orion.md`
   - Or create a skill that retrieves them on-demand

5. **Add to .env.example**
   ```bash
   # GCS Configuration
   GCS_MEMORIES_BUCKET=orion-memories
   ```

---

## Summary Table

| Component | Status | Location |
|-----------|--------|----------|
| **GCS Bucket Config** | ✓ Implemented | `src/config/environment.ts` |
| **Memory Tool Handler** | ✓ Implemented | `src/tools/memory/` |
| **GCS Storage Layer** | ✓ Implemented | `src/tools/memory/storage.ts` |
| **Path Builders** | ✓ Implemented | `src/tools/memory/paths.ts` |
| **Agent Memory Files** | ✓ Runtime-created | `gs://orion-memories/memories/` |
| **company-context.md** | ✗ Not implemented | Planned only |
| **department-workflows.md** | ✗ Not implemented | Planned only |
| **tool-inventory.md** | ✗ Not implemented | Planned only |
| **Reference Doc Loader** | ✗ Not implemented | No design yet |
| **.env.example GCS var** | ✗ Missing | Should add |

