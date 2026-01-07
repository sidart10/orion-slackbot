# Tech Spec: Migrate Skills to Anthropic's Container

**Status:** Proposed (Revised)
**Date:** 2026-01-07
**Author:** Winston (Architect Agent)
**Revised:** 2026-01-07 (SM Review — expanded scope)
**Impact:** High — Requires adopting Anthropic Skills API + Files API

---

## Executive Summary

We discovered that Anthropic's code execution container supports **both** Skills AND Programmatic Tool Calling (PTC) in the same environment. This could **eliminate the GKE sandbox** for most use cases.

**However**, this is not a simple migration. It requires **adopting Anthropic's Skills API and Files API** — a fundamentally different architecture than our current filesystem-based approach.

### Key Architectural Changes Required

| Component | Current State | Required State |
|-----------|--------------|----------------|
| **Skill Storage** | `.skills/` folder, baked into Docker | Uploaded to Anthropic via Skills API |
| **Skill Reference** | Filesystem path | `skill_id` from API |
| **Skill Loading** | `orion_sandbox({ skill_doc })` | `container: { skills: [...] }` |
| **Prompt Builder** | Tells Claude to call GKE sandbox | Removed — Claude auto-loads skills |
| **Generated Files** | N/A (sandbox output is stdout) | Files API download (`file_id`) |
| **Container Lifecycle** | Per-execution SandboxClaim | Reusable `container.id` across turns |
| **Version Management** | Git + Docker builds | API versioning (`skill.version`) |
| **Beta Headers** | `code-execution-2025-08-25` | + `skills-2025-10-02`, `files-api-2025-04-14` |

---

## Current Architecture (Complex)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORION SLACK AGENT                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         ANTHROPIC API                                │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐   │   │
│  │  │  code_execution     │  │  MCP Tools (via allowed_callers)    │   │   │
│  │  │  (PTC)              │  │  - Rube, Exa, Imagen, Veo, etc.     │   │   │
│  │  └─────────────────────┘  └─────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      GKE SANDBOX (orion_sandbox)                     │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐   │   │
│  │  │  Skills             │  │  Network Access                      │   │   │
│  │  │  (.skills/ folder)  │  │  - HTTP to MCP servers              │   │   │
│  │  │                     │  │  - External APIs                     │   │   │
│  │  └─────────────────────┘  └─────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  Infrastructure:                                                    │   │
│  │  - SandboxClaims (K8s CRD)                                         │   │
│  │  - Sandbox Router (port-forward for local dev)                     │   │
│  │  - Custom Docker image with skills baked in                        │   │
│  │  - GCP auth, K8s API access                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SKILL LOADING (Current)                         │   │
│  │                                                                     │   │
│  │  1. loader.ts reads .skills/*/SKILL.md from filesystem             │   │
│  │  2. prompt-builder.ts injects hint into system prompt              │   │
│  │  3. Hint tells Claude: orion_sandbox({ skill_doc: "skill:name" })  │   │
│  │  4. GKE sandbox reads /skills/{name}/SKILL.md and returns content  │   │
│  │  5. Claude uses skill instructions to complete task                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

Problems:
- Complex K8s lifecycle (create → poll → execute → delete)
- Port-forward dies on local dev (network hiccups, laptop sleep)
- Latency: ~1.8s warm, ~10s cold start
- Operational overhead: Docker builds, GKE cluster, monitoring
- Skills baked into Docker image — requires rebuild to update
```

---

## Proposed Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORION SLACK AGENT                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         ANTHROPIC API                                │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              CODE EXECUTION CONTAINER                        │   │   │
│  │  │                                                             │   │   │
│  │  │  ┌─────────────────┐    ┌─────────────────────────────┐    │   │   │
│  │  │  │  Custom Skills  │    │  PTC (Programmatic Tool     │    │   │   │
│  │  │  │  (uploaded via  │    │   Calling)                  │    │   │   │
│  │  │  │   Skills API)   │    │                             │    │   │   │
│  │  │  └────────┬────────┘    └──────────────┬──────────────┘    │   │   │
│  │  │           │                            │                    │   │   │
│  │  │           └──────────┬─────────────────┘                    │   │   │
│  │  │                      ▼                                      │   │   │
│  │  │           ┌─────────────────────┐                          │   │   │
│  │  │           │  MCP Tools via      │                          │   │   │
│  │  │           │  allowed_callers    │                          │   │   │
│  │  │           │  (Anthropic routes) │                          │   │   │
│  │  │           └─────────────────────┘                          │   │   │
│  │  │                      │                                      │   │   │
│  │  └──────────────────────┼──────────────────────────────────────┘   │   │
│  │                         ▼                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  MCP Servers (external)                                      │   │   │
│  │  │  - Rube (Composio) - 500+ app integrations                  │   │   │
│  │  │  - Exa - web search                                         │   │   │
│  │  │  - Imagen/Veo - generative media                            │   │   │
│  │  │  - Audience Manager, MSCI Reports (internal)                │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  FILES API (NEW)                                             │   │   │
│  │  │  - Download generated files (xlsx, pdf, pptx, etc.)         │   │   │
│  │  │  - Upload input files for processing                         │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SKILL LOADING (New)                             │   │
│  │                                                                     │   │
│  │  1. Skills uploaded to Anthropic via Skills API (one-time)         │   │
│  │  2. container: { skills: [{ skill_id, version }] } in API call     │   │
│  │  3. Claude auto-loads skills from /skills/ in container            │   │
│  │  4. No prompt injection needed — progressive disclosure built-in   │   │
│  │  5. Generated files returned via file_id → Files API download      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GKE SANDBOX (orion_sandbox) — OPTIONAL, EDGE CASES ONLY           │   │
│  │  - Arbitrary HTTP to non-MCP services                              │   │
│  │  - Custom Python packages not in Anthropic's container             │   │
│  │  - Long-running processes (>5 min timeout)                         │   │
│  │  - Playwright/browser automation                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

Benefits:
- No K8s lifecycle management for most skills
- No port-forward issues on local dev
- Lower latency (Anthropic manages container)
- Simpler architecture
- Skills versioning via Anthropic API
- Container reuse across conversation turns
- Generated files accessible via Files API
```

---

## Key Insight

From Anthropic's documentation:

> Skills run in the code execution container with these limitations:
> - **No network access** - Cannot make external API calls
> - **No runtime package installation** - Only pre-installed packages available

**"No network access" means no arbitrary HTTP calls.** But MCP tool calls via `allowed_callers` ARE supported because **Anthropic routes them** — they don't go over the network from inside the container.

So Skills in Anthropic's container **CAN** call MCP tools (Rube, Exa, etc.) through PTC!

---

## What This Migration Actually Requires

### 1. Skills API Integration (NEW)

**Current:** Skills loaded from filesystem, injected via system prompt
**New:** Skills uploaded to Anthropic, referenced by `skill_id`

```typescript
// Upload skill (one-time or CI/CD)
const skill = await client.beta.skills.create({
  displayTitle: 'summarize',
  files: filesFromDir('.skills/summarize'),
  betas: ['skills-2025-10-02'],
});
// Returns: { id: 'skill_01AbCdEfGhIjKlMnOpQrStUv', latest_version: '...' }

// Use skill in messages
const response = await client.beta.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  betas: ['code-execution-2025-08-25', 'skills-2025-10-02'],
  container: {
    skills: [
      { type: 'anthropic', skill_id: 'xlsx', version: 'latest' },  // Built-in
      { type: 'custom', skill_id: 'skill_01AbCd...', version: 'latest' },  // Custom
    ],
  },
  tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
  messages: [...],
});
```

### 2. Files API Integration (NEW)

**Current:** Sandbox returns stdout/stderr only
**New:** Generated files returned via `file_id`, downloaded via Files API

```typescript
// Extract file IDs from response
function extractFileIds(response: BetaMessage): string[] {
  const fileIds: string[] = [];
  for (const item of response.content) {
    if (item.type === 'bash_code_execution_tool_result') {
      for (const file of item.content.content) {
        if ('file_id' in file) {
          fileIds.push(file.file_id);
        }
      }
    }
  }
  return fileIds;
}

// Download generated files
for (const fileId of extractFileIds(response)) {
  const metadata = await client.beta.files.retrieve_metadata(fileId, {
    betas: ['files-api-2025-04-14'],
  });
  const content = await client.beta.files.download(fileId, {
    betas: ['files-api-2025-04-14'],
  });
  // Upload to Slack or process...
}
```

### 3. Remove Prompt Builder Skill Injection

**Current:** `prompt-builder.ts` line 87:
```typescript
// Tells Claude to call orion_sandbox to load skill
return `orion_sandbox({ skill_doc: "skill:{skill-name}" })`;
```

**New:** Remove entirely — Claude auto-loads skills from container

### 4. Container Lifecycle Management

**Current:** Each sandbox execution is isolated (SandboxClaim per call)
**New:** Container persists across turns, track `container.id`

```typescript
// Track container ID for conversation
let activeContainerId: string | undefined;

// In agent loop
const response = await client.beta.messages.create({
  container: {
    ...(activeContainerId ? { id: activeContainerId } : {}),
    skills: [...],
  },
  // ...
});

// Capture for reuse
if (response.container?.id) {
  activeContainerId = response.container.id;
}
```

### 5. Skill ID Mapping Configuration

**New file:** `.orion/skills.yaml` or environment config

```yaml
# Maps local skill names to Anthropic skill IDs
skills:
  # Anthropic built-in skills
  xlsx:
    type: anthropic
    skill_id: xlsx
    version: latest
  pdf:
    type: anthropic
    skill_id: pdf
    version: latest
  docx:
    type: anthropic
    skill_id: docx
    version: latest

  # Custom skills (uploaded via Skills API)
  summarize:
    type: custom
    skill_id: skill_01AbCdEfGhIjKlMnOpQrStUv
    version: latest
  algorithmic-art:
    type: custom
    skill_id: skill_02BcDeFgHiJkLmNoPqRsTuVw
    version: latest
```

---

## Migration Analysis

### Current Skills Inventory (Audited)

| Skill | Can Migrate? | Reason | Action |
|-------|--------------|--------|--------|
| **xlsx** | ✅ Yes | Anthropic has built-in `xlsx` skill | **Use Anthropic's** |
| **pdf** | ✅ Yes | Anthropic has built-in `pdf` skill | **Use Anthropic's** |
| **docx** | ✅ Yes | Anthropic has built-in `docx` skill | **Use Anthropic's** |
| **summarize** | ✅ Yes | Can use Rube MCP for Slack API | **Upload to Anthropic** |
| **example** | ✅ Yes | Pure demonstration, no network | **Upload or drop** |
| **algorithmic-art** | ✅ Yes | Pure p5.js computation | **Upload to Anthropic** |
| **skill-creator** | ✅ Yes | Documentation only | **Upload to Anthropic** |
| **frontend-design** | ✅ Yes | Pure code generation | **Upload to Anthropic** |
| **mcp-builder** | ✅ Yes | Documentation + code gen | **Upload to Anthropic** |
| **d3js-visualization** | ✅ Yes | Pure D3.js computation | **Upload to Anthropic** |
| **webapp-testing** | ❌ No | Needs Playwright + local servers | **Keep in GKE** |
| **web-artifacts-builder** | ❌ No | Needs local filesystem for builds | **Keep in GKE** |

**Summary:**
- **3 Skills** → Use Anthropic's built-in versions (xlsx, pdf, docx)
- **7 Skills** → Upload to Anthropic as custom skills
- **2 Skills** → Must stay in GKE sandbox (webapp-testing, web-artifacts-builder)

---

## Implementation Plan

### Phase 1: API Integration Foundation

**Story 6.4: Anthropic Skills API Integration**

| Task | Description | Effort |
|------|-------------|--------|
| 1 | Add `skills-2025-10-02` beta header to agent loop | 1h |
| 2 | Create skill upload script (`scripts/upload-skills.ts`) | 2h |
| 3 | Create skill ID mapping config (`.orion/skills.yaml`) | 1h |
| 4 | Add `container: { skills: [...] }` to messages.create() | 2h |
| 5 | Track `container.id` for multi-turn reuse | 2h |
| 6 | Update types for skill container response | 1h |

**Story 6.5: Anthropic Files API Integration**

| Task | Description | Effort |
|------|-------------|--------|
| 1 | Add `files-api-2025-04-14` beta header | 30m |
| 2 | Create file extraction helper (`extractFileIds()`) | 1h |
| 3 | Create file download service | 2h |
| 4 | Integrate file download with Slack file upload | 2h |
| 5 | Handle file cleanup (delete after upload to Slack) | 1h |

### Phase 2: Skill Migration

**Story 6.6: Migrate Skills to Anthropic**

| Task | Description | Effort |
|------|-------------|--------|
| 1 | Upload 7 custom skills to Anthropic via script | 1h |
| 2 | Configure 3 built-in skills (xlsx, pdf, docx) | 30m |
| 3 | Update `.orion/skills.yaml` with all skill IDs | 30m |
| 4 | Test each migrated skill end-to-end | 4h |
| 5 | Update prompt builder to remove `orion_sandbox` skill hint | 1h |

### Phase 3: Cleanup & Deprecation

**Story 6.7: GKE Sandbox Deprecation (Partial)**

| Task | Description | Effort |
|------|-------------|--------|
| 1 | Keep `orion_sandbox` for webapp-testing, web-artifacts-builder | - |
| 2 | Remove skills from sandbox Docker image | 1h |
| 3 | Update documentation | 2h |
| 4 | Remove unused sandbox infrastructure (if fully deprecated) | 4h |

---

## Code Changes Required

### Files to Modify

| File | Change |
|------|--------|
| `src/agent/loop.ts` | Add `container` param, track `container.id`, add beta headers |
| `src/agent/orion.ts` | Pass container config through agent |
| `src/skills/loader.ts` | Load skill IDs from config instead of filesystem (for migrated skills) |
| `src/skills/prompt-builder.ts` | Remove `orion_sandbox({ skill_doc })` hint for migrated skills |
| `src/config/environment.ts` | Add skills config path |

### New Files

| File | Purpose |
|------|---------|
| `src/services/anthropic-files.ts` | Files API download service |
| `src/services/skill-registry.ts` | Map skill names to Anthropic skill IDs |
| `scripts/upload-skills.ts` | One-time skill upload script |
| `.orion/skills.yaml` | Skill ID mapping configuration |

### Files to Remove (If Full Deprecation)

| File | Reason |
|------|--------|
| `src/tools/code-execution/*` | Replaced by Anthropic container |
| `src/tools/orion-sandbox/*` | Replaced by Anthropic container |
| `infra/gke-sandbox/*` | Infrastructure no longer needed |
| `scripts/dev-sandbox-tunnel.sh` | Port-forward no longer needed |

---

## Trade-offs

### Pros

| Benefit | Impact |
|---------|--------|
| No K8s infrastructure (for most skills) | Eliminates ~80% of sandbox complexity |
| No port-forward issues | Local dev just works |
| Lower latency | Anthropic optimizes container startup |
| Skill versioning | Built-in via Anthropic API |
| Container reuse | Same container across turns (faster) |
| Generated file handling | Files API is cleaner than stdout parsing |
| Simpler debugging | Anthropic handles execution environment |

### Cons

| Concern | Mitigation |
|---------|------------|
| Skill upload required | One-time setup, can automate in CI/CD |
| Files API integration | New code, but well-documented |
| Vendor lock-in | Skills are portable (SKILL.md standard) |
| Limited packages | Most common packages pre-installed |
| No arbitrary HTTP | Use MCP tools via `allowed_callers` |
| 5 min timeout | Sufficient for most use cases |
| Must keep GKE for 2 skills | Hybrid approach is acceptable |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing Python package | Medium | High | Audit packages before migration |
| Skills API beta changes | Low | Medium | Pin SDK version, monitor changelog |
| Files API beta changes | Low | Medium | Pin SDK version, monitor changelog |
| Skill upload failures | Low | Low | Retry logic, validation |
| Container timeout | Low | Medium | Break long tasks into steps |
| Hybrid complexity | Medium | Medium | Clear documentation on which path each skill uses |

---

## Decision Points

1. **Full migration vs hybrid?**
   - **Recommendation:** Hybrid — keep GKE for webapp-testing, web-artifacts-builder
   - Eliminates ~90% of GKE usage while maintaining capability for edge cases

2. **Skill management strategy?**
   - **Recommendation:** All custom skills uploaded to Anthropic, managed via Skills API
   - Use CI/CD script to sync `.skills/` folder to Anthropic on deploy

3. **Version pinning strategy?**
   - **Production:** Pin to specific versions initially, then move to `latest` after stabilization
   - **Development:** Use `latest`

4. **Container reuse scope?**
   - **Recommendation:** Per-conversation (Slack thread)
   - Clear container on new thread or after timeout

---

## Effort Estimate

| Phase | Stories | Effort |
|-------|---------|--------|
| Phase 1: API Integration | 6.4, 6.5 | ~2-3 days |
| Phase 2: Skill Migration | 6.6 | ~1-2 days |
| Phase 3: Cleanup | 6.7 | ~1 day |
| **Total** | | **4-6 days** |

---

## Success Criteria

1. ✅ 10 skills (3 built-in + 7 custom) working via Anthropic container
2. ✅ Generated files (xlsx, pdf, etc.) downloadable and uploadable to Slack
3. ✅ Container reused across conversation turns
4. ✅ GKE sandbox retained for webapp-testing, web-artifacts-builder only
5. ✅ Local development works without port-forward (for migrated skills)
6. ✅ Latency improved vs GKE sandbox

---

## Next Steps

1. [ ] **Review this tech spec** — SM/Architect approval
2. [ ] **Create stories 6.4-6.7** — Break down implementation
3. [ ] **Spike: Upload one skill** — Validate workflow end-to-end
4. [ ] **Spike: Files API download** — Validate file handling
5. [ ] **Update epics.md** — Add new stories to Epic 6

---

## Appendix A: TypeScript SDK API Reference (Researched 2026-01-07)

### Files API (`client.beta.files.*`)

**Beta Header Required:** `files-api-2025-04-14`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `upload(params)` | `POST /v1/files` | Upload file, returns `FileMetadata` |
| `list(params)` | `GET /v1/files` | List all files with pagination |
| `retrieveMetadata(fileId)` | `GET /v1/files/{file_id}` | Get file metadata |
| `download(fileId)` | `GET /v1/files/{file_id}/content` | Download file content |
| `delete(fileId)` | `DELETE /v1/files/{file_id}` | Delete file |

**TypeScript Types:**

```typescript
// Upload a file
interface FileUploadParams {
  file: Uploadable;  // fs.createReadStream(), Buffer, etc.
  betas?: Array<AnthropicBeta>;
}

// File metadata returned by upload/list/retrieve
interface FileMetadata {
  id: string;           // e.g., 'file_01AbCdEf...'
  created_at: string;   // ISO 8601
  filename: string;     // Original filename
  mime_type: string;    // e.g., 'application/pdf'
  size_bytes: number;
  type: 'file';
  downloadable?: boolean;
}

// Upload files to container via message content
interface BetaContainerUploadBlockParam {
  file_id: string;
  type: 'container_upload';
  cache_control?: BetaCacheControlEphemeral | null;
}
```

**Example Usage:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createReadStream } from 'fs';

const client = new Anthropic();

// Upload a file
const fileObject = await client.beta.files.upload({
  file: createReadStream('data.csv'),
  betas: ['files-api-2025-04-14'],
});

// Use file in message
const response = await client.beta.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  betas: ['code-execution-2025-08-25', 'files-api-2025-04-14'],
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Analyze this CSV data' },
      { type: 'container_upload', file_id: fileObject.id }  // <-- Pass file to container
    ]
  }],
  tools: [{ type: 'code_execution_20250825', name: 'code_execution' }]
});

// Download generated files from response
const downloadFile = async (fileId: string) => {
  const metadata = await client.beta.files.retrieveMetadata(fileId, {
    betas: ['files-api-2025-04-14']
  });
  const content = await client.beta.files.download(fileId, {
    betas: ['files-api-2025-04-14']
  });
  // content is a Response object - use .blob(), .arrayBuffer(), etc.
  return { metadata, content };
};
```

---

### Skills API (`client.beta.skills.*`)

**Beta Header Required:** `skills-2025-10-02`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `create(params)` | `POST /v1/skills` | Upload custom skill |
| `retrieve(skillId)` | `GET /v1/skills/{skill_id}` | Get skill details |
| `list(params)` | `GET /v1/skills` | List all skills (filter by source) |
| `delete(skillId)` | `DELETE /v1/skills/{skill_id}` | Delete skill |
| `versions.create(...)` | `POST /v1/skills/{skill_id}/versions` | Create new version |
| `versions.list(...)` | `GET /v1/skills/{skill_id}/versions` | List versions |
| `versions.delete(...)` | `DELETE /v1/skills/{skill_id}/versions/{version}` | Delete version |

**TypeScript Types:**

```typescript
// Create a skill
interface SkillCreateParams {
  display_title?: string | null;
  files?: Array<Uploadable> | null;  // Must include SKILL.md at root
  betas?: Array<AnthropicBeta>;
}

// Skill response
interface SkillCreateResponse {
  id: string;              // e.g., 'skill_01AbCdEf...'
  created_at: string;
  display_title: string | null;
  latest_version: string | null;
  source: 'custom' | 'anthropic';
  type: 'skill';
  updated_at: string;
}

// Using skills in container
interface BetaContainerParams {
  id?: string | null;      // Reuse existing container
  skills?: Array<BetaSkillParams> | null;
}

interface BetaSkillParams {
  skill_id: string;
  type: 'anthropic' | 'custom';
  version?: string;  // 'latest' or specific version
}
```

**Example Usage:**

```typescript
// Upload a custom skill (one-time, or in CI/CD)
const skill = await client.beta.skills.create({
  display_title: 'Summarize Thread',
  files: [
    await toFile(createReadStream('.skills/summarize/SKILL.md'), 'summarize/SKILL.md'),
    await toFile(createReadStream('.skills/summarize/scripts/summarize.py'), 'summarize/scripts/summarize.py'),
  ],
  betas: ['skills-2025-10-02'],
});
console.log(`Created skill: ${skill.id}, version: ${skill.latest_version}`);

// Use skills in message
const response = await client.beta.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  betas: ['code-execution-2025-08-25', 'skills-2025-10-02'],
  max_tokens: 4096,
  container: {
    skills: [
      { type: 'anthropic', skill_id: 'xlsx', version: 'latest' },      // Built-in
      { type: 'custom', skill_id: skill.id, version: 'latest' },       // Custom
    ]
  },
  messages: [{ role: 'user', content: 'Create a spreadsheet...' }],
  tools: [{ type: 'code_execution_20250825', name: 'code_execution' }]
});

// Container ID for reuse in subsequent messages
const containerId = response.container?.id;
```

---

### Combined Beta Headers

For full Skills + Files + Code Execution:

```typescript
const response = await client.beta.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  betas: [
    'code-execution-2025-08-25',   // Required for code_execution tool
    'skills-2025-10-02',           // Required for container.skills
    'files-api-2025-04-14',        // Required for file upload/download
  ],
  // ...
});
```

---

### Response Structure for Generated Files

When Skills create files (xlsx, pdf, pptx, etc.), they appear in the response as:

```typescript
interface BashCodeExecutionToolResult {
  type: 'bash_code_execution_tool_result';
  tool_use_id: string;
  content: {
    type: 'bash_code_execution_result';
    stdout: string;
    stderr: string;
    return_code: number;
    content?: Array<{
      file_id?: string;  // <-- Generated file ID
      // ... other fields
    }>;
  };
}

// Helper to extract file IDs
function extractFileIds(response: BetaMessage): string[] {
  const fileIds: string[] = [];
  for (const item of response.content) {
    if (item.type === 'bash_code_execution_tool_result') {
      const resultContent = item.content;
      if (resultContent.type === 'bash_code_execution_result' && resultContent.content) {
        for (const file of resultContent.content) {
          if ('file_id' in file && file.file_id) {
            fileIds.push(file.file_id);
          }
        }
      }
    }
  }
  return fileIds;
}
```

---

## References

- [Anthropic Skills API Documentation](https://docs.anthropic.com/claude/docs/agent-skills)
- [Using Skills with API](docs/anthropic-sdk/using-skills-with-api.md)
- [Anthropic Files API](https://docs.anthropic.com/claude/docs/files-api)
- [Code Execution Tool](https://docs.anthropic.com/claude/docs/tool-use/code-execution-tool)
- Story 6.2: execute_code Tool (GKE Agent Sandbox)
- Story 6.3: Anthropic Managed Programmatic Tool Calling (PTC)
