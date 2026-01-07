# Story 6.2: Skills API Client for Anthropic Container Integration

Status: done

## Story

As a **developer**,
I want Orion to upload local skills to Anthropic's Skills API and use them in the code execution container,
So that skills execute in Anthropic's managed environment with full code execution capabilities.

## Scope Boundary (Non-Negotiable)

This story implements the **Skills API client** for uploading and using skills via Anthropic's container.

- **IN SCOPE:**
  - Skills API client (`src/skills/api-client.ts`) for CRUD operations
  - Skill upload/sync from `.skills/` directory to Anthropic's Skills API
  - Container parameter building for Messages API requests
  - Integration with agent loop to pass skills in container parameter
  - Version management and caching of uploaded skill IDs

- **OUT OF SCOPE:**
  - Modifying SKILL.md format (Story 6.1 owns this)
  - GKE Sandbox execution (removed from scope per tech-spec migration)
  - Local script execution (skills run in Anthropic container)

## Context: Skills Migration to Anthropic Container

**Reference:** `_bmad-output/tech-spec-skills-migration-to-anthropic-container.md`

The project has migrated from GKE Sandbox to Anthropic's managed container for skill execution. This provides:
- Built-in code execution with network isolation
- Pre-installed Python packages
- File generation and download capabilities
- Progressive disclosure (skills metadata injected, full SKILL.md at `/skills/{name}/`)

## Acceptance Criteria

1. **Given** skills in `.skills/` directory, **When** Orion starts, **Then** skills are uploaded to Anthropic Skills API and skill IDs are cached

2. **Given** a conversation with code execution enabled, **When** building the Messages API request, **Then** the container parameter includes all uploaded skills AND the `code_execution` tool

3. **Given** an uploaded skill, **When** listing skills via API, **Then** the skill appears with correct metadata and version

4. **Given** a modified SKILL.md file, **When** sync runs, **Then** a new skill version is created (not a new skill)

5. **Given** the Skills API beta, **When** making requests, **Then** correct beta headers are included via consolidated `config.anthropic.allBetas` array: `code-execution-2025-08-25`, `skills-2025-10-02`, `files-api-2025-04-14` (for file downloads), plus existing `context-management-2025-06-27`, `advanced-tool-use-2025-11-20`

6. **Given** skill upload, **When** complete, **Then** Langfuse captures upload metrics (duration, success/failure, skill count)

7. **Given** environment variable `ANTHROPIC_SKILLS_ENABLED=false`, **When** Orion starts, **Then** skill upload is skipped and no container.skills parameter is added

8. **Given** a long-running skill operation, **When** API returns `pause_turn` stop reason, **Then** agent loop continues conversation with same container ID

9. **Given** a skill generates files during execution, **When** the response contains `file_id` attributes in `bash_code_execution_tool_result` blocks, **Then** file IDs are extractable for downstream processing (actual file download via Files API is OUT OF SCOPE but response parsing must support it)

## Tasks / Subtasks

### Task 1: Skills API Client Module (AC: #1, #3, #5)

Create `src/skills/api-client.ts` with typed methods for Anthropic Skills API:

- [x] **1.1** Create `SkillsApiClient` class wrapping Anthropic SDK beta endpoints
- [x] **1.2** Implement `listSkills(source?: 'custom' | 'anthropic')` method
- [x] **1.3** Implement `createSkill(displayTitle: string, files: SkillFiles)` method
- [x] **1.4** Implement `retrieveSkill(skillId: string)` method
- [x] **1.5** Implement `createSkillVersion(skillId: string, files: SkillFiles)` method
- [x] **1.6** Implement `deleteSkillVersion(skillId: string, version: string)` method
- [x] **1.7** Implement `deleteSkill(skillId: string)` method (deletes all versions first)
- [x] **1.8** Add exponential backoff retry for transient 5xx errors (max 3 retries: 1s/2s/4s)

### Task 2: Skill Sync Service (AC: #1, #4)

Create `src/skills/sync-service.ts` for syncing local skills to API:

- [x] **2.1** Implement `syncSkills(traceId: string)` main entry point — use `Promise.all()` for parallel uploads within rate limits
- [x] **2.2** Implement `hashSkillDirectory(skillPath: string)` using SHA-256 (`crypto.createHash('sha256')`)
- [x] **2.3** Implement `loadSkillFiles(skillPath: string)` using `toFile()` helper (see SDK imports below)
- [x] **2.4** Implement skill ID cache: `.skills/.cache/skills.json`
- [x] **2.5** Implement version diffing: compare local hash vs cached hash
- [x] **2.6** Create new skill version (not new skill) when content changes
- [x] **2.7** Add graceful handling when skill doesn't exist (create) vs exists (update version)
- [x] **2.8** Call existing `loadSkillMetadata()` from `loader.ts` to discover local skills

### Task 3: Container Parameter Builder (AC: #2, #5)

Create `src/skills/container-builder.ts` for Messages API integration:

- [x] **3.1** Implement `buildContainerParameter(skillIds: string[], containerId?: string)` returning container object
- [x] **3.2** Support both custom skills and anthropic-managed skills
- [x] **3.3** Support version pinning (default: `latest`)
- [x] **3.4** Return `undefined` when no skills to include
- [x] **3.5** Enforce max 8 skills per request (API limit)

### Task 4: Agent Loop Integration (AC: #2, #7, #8, #9)

Update `src/agent/loop.ts` to include skills in container parameter:

- [x] **4.1** Add `getUploadedSkillIds()` helper to retrieve cached skill IDs (via `getCachedSkillIds()` in sync-service)
- [x] **4.2** Update `executeAgentLoop()` to include container parameter in Messages API call
- [x] **4.3** **IMPORTANT:** `code_execution` tool already exists in loop.ts:490-493. Verify no duplicate when skills added. The existing tool `{ type: 'code_execution_20250825', name: 'code_execution' }` should be reused.
- [x] **4.4** Add `ANTHROPIC_SKILLS_ENABLED` environment variable check (via config.anthropic.skillsEnabled)
- [x] **4.5** Store `response.container.id` for conversation reuse across turns (extend existing container handling at loop.ts:664-671)
- [x] **4.6** Handle `pause_turn` stop reason — continue conversation with same container ID
- [x] **4.7** **CRITICAL:** Consolidate ALL beta headers. Current loop.ts:120-125 has `context-management-2025-06-27,advanced-tool-use-2025-11-20`. Move to `config.anthropic.allBetas` and merge with skills betas.
- [x] **4.8** Add `extractFileIds(response)` helper to parse `bash_code_execution_tool_result` blocks for `file_id` attributes (for AC#9)

### Task 5: Startup Skill Sync (AC: #1, #6)

Integrate skill sync into application startup:

- [x] **5.1** Add `initializeSkills(traceId: string)` function in `src/skills/init.ts`
- [x] **5.2** Call sync service on startup in `src/index.ts` — insert AFTER Langfuse init (line ~25) but BEFORE Slack Bolt app.start() (line ~85). Adds ~1-3s to cold start.
- [x] **5.3** Log skill upload results with Langfuse span
- [x] **5.4** Handle sync failures gracefully (log warning, continue without skills)
- [x] **5.5** Export `skillsInitialized: boolean` flag for agent loop to check before adding container param (via `isSkillsInitialized()`)

### Task 6: Configuration & Environment (AC: #5, #7)

- [x] **6.1** Add `ANTHROPIC_SKILLS_ENABLED` to environment config (default: `true`)
- [x] **6.2** Create `config.anthropic.allBetas` array consolidating ALL betas:
  ```typescript
  allBetas: [
    'context-management-2025-06-27',  // Memory tool (existing)
    'advanced-tool-use-2025-11-20',   // PTC (existing)
    'code-execution-2025-08-25',      // Skills execution (NEW)
    'skills-2025-10-02',              // Skills API CRUD (NEW)
    'files-api-2025-04-14',           // File downloads (NEW)
  ]
  ```
- [ ] **6.3** Update `.env.example` with new variable (DEFERRED - not required for story completion)
- [x] **6.4** Add config validation for skills-related settings (via skillsEnabled check)
- [x] **6.5** Update Anthropic client instantiation in loop.ts to use `config.anthropic.allBetas.join(',')` instead of hardcoded string

### Task 7: Unit Tests (AC: #1-9)

- [x] **7.1** `api-client.test.ts` - Mock SDK calls, test all CRUD methods, test retry logic with mocked 429/5xx responses (17 tests)
- [x] **7.2** `sync-service.test.ts` - Test sync logic, hash comparison, version creation (11 tests)
- [x] **7.3** `container-builder.test.ts` - Test container parameter structure, max 8 skills limit, verify `skill_id` snake_case (11 tests)
- [x] **7.4** Integration test: full upload → retrieve → use in container flow (via init.test.ts)
- [x] **7.5** Test `pause_turn` handling in agent loop (in loop.test.ts)
- [x] **7.6** Test `extractFileIds()` helper with sample `bash_code_execution_tool_result` response (in loop.test.ts)
- [x] **7.7** Test error event emission to Langfuse for API failures (429, 5xx, quota exceeded) (in api-client.test.ts)

## Dev Notes

### File Operations Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/skills/api-client.ts` | Skills API client wrapper |
| CREATE | `src/skills/api-client.test.ts` | Unit tests (17 tests) |
| CREATE | `src/skills/sync-service.ts` | Local → API sync logic |
| CREATE | `src/skills/sync-service.test.ts` | Unit tests (11 tests) |
| CREATE | `src/skills/container-builder.ts` | Container parameter builder |
| CREATE | `src/skills/container-builder.test.ts` | Unit tests (11 tests) |
| CREATE | `src/skills/init.ts` | Startup initialization + `skillsInitialized` flag |
| CREATE | `src/skills/init.test.ts` | Unit tests (4 tests) |
| CREATE | `src/skills/container-lifecycle.ts` | Container ID persistence across turns (Story 6.3 bundled) |
| CREATE | `src/skills/container-lifecycle.test.ts` | Unit tests for container lifecycle |
| CREATE | `tests/factories/skills-factory.ts` | Test factories for skills mocking |
| CREATE | `tests/factories/container-factory.ts` | Test factories for container lifecycle |
| MODIFY | `src/skills/types.ts` | Add `ApiSkill`, `ApiSkillVersion`, `SkillCache`, `ContainerParameter`, `SkillGeneratedFile`, `SkillExecutionFiles`, `ContainerState`, `ContainerLifecycleConfig` |
| MODIFY | `src/skills/index.ts` | Re-export new modules including container lifecycle |
| MODIFY | `src/agent/loop.ts` | Add container param, handle `pause_turn`, use consolidated betas, add `extractFileIds()`, integrate container lifecycle |
| MODIFY | `src/agent/loop.test.ts` | Add tests for pause_turn, extractFileIds, container lifecycle |
| MODIFY | `src/agent/orion.ts` | Add threadTs to AgentContext for container tracking |
| MODIFY | `src/config/environment.ts` | Add `ANTHROPIC_SKILLS_ENABLED`, `allBetas` array |
| MODIFY | `src/config/environment.test.ts` | Add tests for new config options |
| MODIFY | `src/index.ts` | Call `initializeSkills()` on startup, add container lifecycle shutdown |
| MODIFY | `src/index.test.ts` | Update tests for startup changes |
| MODIFY | `tests/factories/index.ts` | Export new factories |
| DEFERRED | `.env.example` | Add ANTHROPIC_SKILLS_ENABLED (not required for story completion)

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR24 | prd.md | Add new Skills via Agent Skills open standard |
| AR | architecture.md | Skills uploaded to Anthropic API, executed in managed container |
| Logging | project-context.md | ALL logs must include `traceId` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Tool handlers | project-context.md:69-92 | MUST return `ToolResult<T>`, NEVER throw |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |

### SDK Imports (EXACT)

```typescript
// Required imports for Skills API client
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';

// For file uploads, use toFile() helper (files_from_dir is Python-only)
const files = [
  await toFile(createReadStream('.skills/summarize/SKILL.md'), 'summarize/SKILL.md', { type: 'text/markdown' }),
  await toFile(createReadStream('.skills/summarize/scripts/run.py'), 'summarize/scripts/run.py', { type: 'text/x-python' }),
];
```

### Existing Code Integration

This story integrates with existing `src/skills/` module:

| Existing File | How This Story Uses It |
|---------------|------------------------|
| `loader.ts` | Call `loadSkillMetadata()` to discover local skills for upload |
| `types.ts` | ADD new types here (don't create separate file) |
| `parser.ts` | Used by loader, no changes needed |
| `prompt-builder.ts` | No changes — still builds hints for system prompt |

### Beta Headers (CRITICAL)

**CONSOLIDATION REQUIRED:** Current `src/agent/loop.ts:120-125` has hardcoded betas. This story must consolidate ALL betas into a single config location.

```typescript
// src/config/environment.ts
export const config = {
  anthropic: {
    // ... existing
    // CONSOLIDATED: All beta headers in one place for easy management
    allBetas: [
      'context-management-2025-06-27',  // Memory tool auto-context (Story 5.1)
      'advanced-tool-use-2025-11-20',   // PTC - Programmatic Tool Calling (Story 6.3)
      'code-execution-2025-08-25',      // Skills execution + container (NEW)
      'skills-2025-10-02',              // Skills API CRUD operations (NEW)
      'files-api-2025-04-14',           // File downloads from container (NEW)
    ],
  },
};

// Usage in loop.ts - replace hardcoded string
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  defaultHeaders: {
    'anthropic-beta': config.anthropic.allBetas.join(','),
  },
});

// Usage in api-client.ts for SDK beta methods
const skills = await client.beta.skills.list({
  betas: config.anthropic.allBetas.filter(b => b.startsWith('skills-'))
});
```

**WHY CONSOLIDATION MATTERS:**
- Single source of truth for beta feature flags
- Easy to add/remove betas as Anthropic releases updates
- Prevents conflicting header configurations
- Clear documentation of which stories require which betas

### Container Parameter Structure

```typescript
interface ContainerParameter {
  id?: string;  // Reuse container across turns (from response.container.id)
  skills: Array<{
    type: 'custom' | 'anthropic';
    skill_id: string;
    version: string;  // epoch timestamp or 'latest'
  }>;
}
```

### Agent Loop Integration Pattern

```typescript
// In src/agent/loop.ts

// Track container ID for conversation reuse
let activeContainerId: string | undefined;

// When calling Messages API:
const response = await client.beta.messages.create({
  model: config.anthropic.model,
  max_tokens: 16384,
  betas: config.anthropic.skillsBetas,
  container: buildContainerParameter(
    await getUploadedSkillIds(),
    activeContainerId  // Reuse container across turns
  ),
  messages: conversationHistory,
  tools: [
    // REQUIRED when skills are present
    { type: 'code_execution_20250825', name: 'code_execution' },
    ...otherTools
  ]
});

// Capture container ID for reuse
if (response.container?.id) {
  activeContainerId = response.container.id;
}

// Handle pause_turn for long-running operations
if (response.stop_reason === 'pause_turn') {
  messages.push({ role: 'assistant', content: response.content });
  // Continue loop — will use same activeContainerId
}
```

### Skill ID Cache Format

Store in `.skills/.cache/skills.json`:

```json
{
  "skills": {
    "deep-research": {
      "skillId": "skill_01AbCdEfGhIjKlMnOpQrStUv",
      "latestVersion": "1759178010641129",
      "contentHash": "sha256:abc123...",
      "lastSynced": "2026-01-07T10:30:00Z"
    }
  }
}
```

### Types to Add to `src/skills/types.ts`

```typescript
/** Skill as returned from Anthropic Skills API */
export interface ApiSkill {
  id: string;              // skill_01AbCdEfGhIjKlMnOpQrStUv
  display_title: string;
  source: 'custom' | 'anthropic';
  latest_version: string;  // epoch timestamp
  created_at: string;      // ISO timestamp
}

/** Skill version from API */
export interface ApiSkillVersion {
  version: string;         // epoch timestamp
  created_at: string;
}

/** Cached skill mapping */
export interface SkillCache {
  skills: Record<string, {
    skillId: string;
    latestVersion: string;
    contentHash: string;
    lastSynced: string;
  }>;
}

/** Container parameter for Messages API (uses snake_case per Anthropic API spec) */
export interface ContainerParameter {
  id?: string;
  skills: Array<{
    type: 'custom' | 'anthropic';
    skill_id: string;      // NOTE: snake_case, NOT camelCase
    version: string;
  }>;
}

/**
 * File generated by skill execution (AC#9)
 * Extracted from bash_code_execution_tool_result content blocks
 */
export interface SkillGeneratedFile {
  file_id: string;         // For Files API download
  filename?: string;       // Original filename if available
}

/**
 * Result of extractFileIds() helper
 */
export interface SkillExecutionFiles {
  fileIds: string[];
  files: SkillGeneratedFile[];
}
```

### Error Handling

| Error | Action | Langfuse Event |
|-------|--------|----------------|
| Skill upload fails (after retries) | Log warning, continue without that skill | `skills.upload.failed` |
| Skills API unavailable (5xx) | Log error, disable skills for session | `skills.api.unavailable` |
| Rate limit hit (429) | Exponential backoff, retry up to 3x | `skills.api.rate_limited` |
| Quota exceeded | Log error, disable skills for session | `skills.api.quota_exceeded` |
| Invalid SKILL.md | Skip that skill, log error (Story 6.1 validation) | `skills.validation.failed` |
| Cache file corrupt | Regenerate cache, re-upload all skills | `skills.cache.regenerated` |
| `pause_turn` returned | Continue conversation with same container ID | (no event - normal flow) |

**Observability for API Errors:**

```typescript
// In api-client.ts - emit Langfuse events for error conditions
const langfuse = getLangfuse();

try {
  const result = await client.beta.skills.create({...});
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    langfuse?.event({
      name: 'skills.api.rate_limited',
      metadata: { traceId, skillName, retryCount },
    });
    // Retry with backoff...
  } else if (error instanceof Anthropic.APIError && error.status >= 500) {
    langfuse?.event({
      name: 'skills.api.unavailable',
      metadata: { traceId, statusCode: error.status, message: error.message },
    });
    // Disable skills for session...
  }
}
```

### API Limits

| Limit | Value | Handling |
|-------|-------|----------|
| Max skills per request | 8 | Enforce in `buildContainerParameter()` |
| Max skill upload size | 8MB | Validate before upload |
| Skill name max length | 64 chars | Validate in sync service |
| Description max length | 1024 chars | Validate in sync service |

### Environment Variables

```bash
# .env.example additions
ANTHROPIC_SKILLS_ENABLED=true  # Enable/disable skills feature
```

### Observability

All operations traced with Langfuse:

```typescript
const span = langfuse?.span({
  name: 'skills.sync',
  traceId,
  input: { skillCount: skills.length }
});

// ... operation

span?.end({
  output: { uploaded: 3, failed: 0, cached: 2 },
  metadata: { durationMs: 1234 }
});
```

### Dependencies (Story Prerequisites)

| Dependency | Story | What It Provides |
|------------|-------|------------------|
| Skills Loader | 6.1 | `loadSkillMetadata()` for local skill discovery |
| Langfuse | 1.2 | Observability for upload operations |
| Environment Config | 1.1 | Config validation patterns |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Upload skills on every request | Upload once at startup, cache IDs |
| Create new skill on every change | Create new version of existing skill |
| Hardcode beta headers | Use `config.anthropic.skillsBetas` array |
| Throw on upload failure | Return error result, continue without skill |
| Store skill IDs in memory only | Persist to `.skills/.cache/skills.json` |
| Import without `.js` extension | Always use `.js` extension for ESM |
| Create new types file | Add types to existing `src/skills/types.ts` |
| Ignore `pause_turn` stop reason | Handle it — continue with same container |

### Success Metrics

| Metric | Target |
|--------|--------|
| Skill upload time | <5s for 3 skills |
| Cache hit rate | >95% after first sync |
| API call efficiency | 1 call per new/changed skill |
| Zero blocking failures | Skills don't crash startup |
| Cold start impact | <3s additional latency |

## Story 6.3 Integration Note

**Container Lifecycle Manager** (originally planned for Story 6.3) was implemented as part of this story to enable full container session reuse across conversation turns. This includes:

- `container-lifecycle.ts`: Singleton manager for threadTs → containerId mapping
- TTL-based expiration (30 minutes) with max entries enforcement (1000)
- Periodic cleanup timer with graceful shutdown support
- Langfuse events for container create/reuse tracking

The implementation is fully integrated with the agent loop and exports from `src/skills/index.ts`. Story 6.3 file can be marked as complete or archived.

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - Skills API client for Anthropic container integration |
| 2026-01-07 | Validation review: Added pause_turn handling, SDK imports, existing code integration, API limits |
| 2026-01-07 | **SM Validation Fixes:** (1) Consolidated beta headers into `config.anthropic.allBetas`, (2) Added `files-api-2025-04-14` beta for file downloads, (3) Fixed `skill_id` snake_case in ContainerParameter, (4) Clarified existing PTC/code_execution tool integration in loop.ts, (5) Added specific startup sequence location in index.ts, (6) Added Langfuse events for API errors (429, 5xx), (7) Added AC#9 for file ID extraction, (8) Added Tasks 4.7, 4.8, 5.5, 6.5, 7.6, 7.7 |
| 2026-01-07 | **Code Review Fixes:** (1) Updated File Operations Summary with all 23 files actually changed, (2) Added Story 6.3 Integration Note explaining bundled container lifecycle, (3) Documented test counts per test file, (4) Added init.test.ts to file list |
