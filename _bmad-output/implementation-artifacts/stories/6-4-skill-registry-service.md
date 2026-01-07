# Story 6.4: Skill Registry Service

Status: done

## Story

As a **developer**,
I want a centralized skill registry that adds Anthropic built-in skill support and metadata lookup capabilities to the existing sync-service cache,
So that the agent loop can include both custom and built-in skills without code changes.

## ⚠️ VALIDATION NOTE: Relationship to sync-service.ts

**Story 6.2 already implements `getCachedSkillIds()` in `sync-service.ts`.**

This story EXTENDS (does not replace) that functionality by adding:
1. **Built-in skill support** — `xlsx`, `pdf`, `docx` (not in cache file)
2. **Metadata lookup** — `getSkillMetadata(skillId)` with full entry details
3. **Type classification** — `isBuiltinSkill(name)` helper
4. **Container format** — `getContainerSkills()` returning API-ready structure

**The registry WRAPS the cache file, it does NOT duplicate sync-service.**

| Function | Location | Purpose |
|----------|----------|---------|
| `syncSkills()` | sync-service.ts | Uploads skills, creates cache |
| `getCachedSkillIds()` | sync-service.ts | Returns `Record<string, string>` for custom skills |
| `skillRegistry.getAllSkillIds()` | **registry.ts (NEW)** | Returns array including built-in skills |
| `skillRegistry.getContainerSkills()` | **registry.ts (NEW)** | Returns API-ready `ContainerSkillReference[]` |

## Scope Boundary (Non-Negotiable)

This story implements the **Skill Registry Service** — extending the sync-service cache with built-in skill support and metadata lookup.

- **IN SCOPE:**
  - `src/skills/registry.ts` — registry wrapping cache + built-in skills
  - `src/skills/registry.test.ts` — unit tests
  - `isBuiltinSkill(name)` helper for skill type detection
  - `getSkillMetadata(skillId)` for full metadata lookup
  - `getContainerSkills()` returning API-ready `ContainerSkillReference[]`
  - Built-in skills: `xlsx`, `pdf`, `docx` (hardcoded)
  - Registry initialization from cache file (`.skills/.cache/skills.json`)

- **OUT OF SCOPE:**
  - Skills API client (Story 6.2 — prerequisite)
  - Container lifecycle management (Story 6.3)
  - Files API integration (Story 6.5)
  - Skill upload logic (handled by sync-service in Story 6.2)
  - **Replacing `getCachedSkillIds()`** — that stays in sync-service

## Critical: Dependencies from Previous Stories

**⚠️ BLOCKING: This story REQUIRES Story 6.2 to be COMPLETE (status: `done` or `ready-for-review`)**

Story 6.2 must create these files before Story 6.4 can begin:

| Dependency | Story | Status | What It Provides |
|------------|-------|--------|------------------|
| `src/skills/api-client.ts` | 6.2 | ✅ Ready | Skills API CRUD operations |
| `src/skills/sync-service.ts` | 6.2 | ✅ Ready | Creates `.skills/.cache/skills.json` cache file |
| `src/skills/types.ts` additions | 6.2 | ✅ Ready | `ApiSkill`, `SkillCache`, `ContainerParameter` types |
| `src/skills/loader.ts` | 6.1 | ✅ Done | `loadSkillMetadata()` for local skill discovery |

**Pre-Implementation Checklist:**
- [x] Verify `src/skills/api-client.ts` exists ✅
- [x] Verify `src/skills/sync-service.ts` exists ✅
- [x] Verify `SkillCache` type is defined in `src/skills/types.ts` ✅
- [x] Verify Story 6.2 status is `ready-for-review` in sprint-status.yaml ✅
- [x] Verify `SkillType` is NOT already defined (check before adding) ✅
- [x] Verify `ContainerSkillReference` is NOT already defined (check before adding) ✅

## File Operations Summary

| Action | File | Lines Est. | Description |
|--------|------|------------|-------------|
| CREATE | `src/skills/registry.ts` | ~150 | Skill registry service |
| CREATE | `src/skills/registry.test.ts` | ~200 | Unit tests |
| MODIFY | `src/skills/types.ts` | +30 | Add registry types |
| MODIFY | `src/skills/index.ts` | +3 | Re-export registry |

## Acceptance Criteria

1. **Given** the skill cache file exists (`.skills/.cache/skills.json`), **When** registry initializes, **Then** all skill mappings are loaded into memory

2. **Given** a local skill name (e.g., `"summarize"`), **When** calling `registry.getSkillId(name)`, **Then** returns the corresponding Anthropic skill ID or `undefined` if not found

3. **Given** an Anthropic built-in skill name (e.g., `"xlsx"`), **When** calling `registry.getSkillId("xlsx")`, **Then** returns `"xlsx"` directly (built-in skills use name as ID)

4. **Given** the registry is initialized, **When** calling `registry.getAllSkillIds()`, **Then** returns array of all available skill IDs (custom + built-in)

5. **Given** a skill ID, **When** calling `registry.getSkillMetadata(skillId)`, **Then** returns the full metadata including name, version, type, and last sync timestamp

6. **Given** registry initialization, **When** cache file is missing or corrupt, **Then** registry initializes empty and logs warning (non-blocking)

7. **Given** the sync service updates the cache, **When** calling `registry.refresh()`, **Then** registry reloads from cache file

8. **Given** observability requirements, **When** registry operations occur, **Then** appropriate debug logs are emitted with operation context

## Tasks / Subtasks

### Task 1: Registry Types (AC: #2, #4, #5)

Add types to `src/skills/types.ts`:

- [x] **1.1** Define `SkillRegistryEntry` interface for cached skill metadata
- [x] **1.2** Define `SkillType` union type: `'custom' | 'anthropic'`
- [x] **1.3** Define `SkillRegistryState` interface for internal state
- [x] **1.4** Export types from `src/skills/index.ts`

### Task 2: Registry Core Implementation (AC: #1, #2, #3, #4, #5, #6)

Create `src/skills/registry.ts`:

- [x] **2.1** Create `SkillRegistry` class with singleton pattern
- [x] **2.2** Implement `initialize(traceId?: string)` to load from cache file
- [x] **2.3** Implement `getSkillId(name: string): string | undefined`
- [x] **2.4** Implement `getAllSkillIds(): string[]`
- [x] **2.5** Implement `getSkillMetadata(skillId: string): SkillRegistryEntry | undefined`
- [x] **2.6** Implement `isBuiltinSkill(name: string): boolean` helper
- [x] **2.7** Add hardcoded `ANTHROPIC_BUILTIN_SKILLS` constant: `['xlsx', 'pdf', 'docx']`
- [x] **2.8** Handle missing/corrupt cache file gracefully (return empty registry, log warning)
- [x] **2.9** Add JSDoc with usage examples

### Task 3: Registry Refresh (AC: #7)

- [x] **3.1** Implement `refresh(traceId?: string)` to reload from cache
- [x] **3.2** Clear existing entries before reload
- [x] **3.3** Emit debug log on refresh completion

### Task 4: Integration Helpers (AC: #4)

- [x] **4.1** Implement `getContainerSkills(): ContainerSkillReference[]` for building container param
- [x] **4.2** Ensure correct `type` field (`'custom'` vs `'anthropic'`) based on skill source
- [x] **4.3** Default version to `'latest'` for all skills

### Task 5: Unit Tests (AC: #1-8)

Create `src/skills/registry.test.ts`:

- [x] **5.1** Test initialization from valid cache file
- [x] **5.2** Test initialization with missing cache file (should not throw)
- [x] **5.3** Test initialization with corrupt JSON (should not throw)
- [x] **5.4** Test `getSkillId()` for custom skill
- [x] **5.5** Test `getSkillId()` for built-in skill (xlsx, pdf, docx)
- [x] **5.6** Test `getSkillId()` for unknown skill (returns undefined)
- [x] **5.7** Test `getAllSkillIds()` returns all skills
- [x] **5.8** Test `getSkillMetadata()` for existing skill
- [x] **5.9** Test `getSkillMetadata()` for unknown skill
- [x] **5.10** Test `refresh()` reloads from cache
- [x] **5.11** Test `getContainerSkills()` returns correct structure
- [x] **5.12** Mock fs operations using `vi.mock`

## Dev Notes

### Types to Add to `src/skills/types.ts`

```typescript
/** Type of skill - built-in Anthropic or custom uploaded */
export type SkillType = 'custom' | 'anthropic';

/** Registry entry for a skill */
export interface SkillRegistryEntry {
  /** Local skill name (e.g., "summarize") */
  name: string;
  /** Anthropic skill ID (e.g., "skill_01AbCdEf..." or "xlsx" for built-in) */
  skillId: string;
  /** Skill type */
  type: SkillType;
  /** Latest version epoch timestamp or 'latest' */
  version: string;
  /** Content hash for change detection */
  contentHash?: string;
  /** Last sync timestamp */
  lastSynced?: string;
}

/** Container skill reference for Messages API (snake_case per Anthropic API) */
export interface ContainerSkillReference {
  type: SkillType;
  skill_id: string;  // NOTE: snake_case for API
  version: string;
}
```

### Import Clarification

```typescript
// These types come from Story 6.2 additions to types.ts
// DO NOT re-define them in Story 6.4 — import and use existing definitions
import type { SkillCache } from './types.js';  // Story 6.2
```

### Registry Implementation Pattern

```typescript
// src/skills/registry.ts
import { existsSync, readFileSync } from 'fs';
import { logger } from '../utils/logger.js';
import type { SkillCache, SkillRegistryEntry, ContainerSkillReference, SkillType } from './types.js';

const CACHE_FILE_PATH = '.skills/.cache/skills.json';

/** Anthropic's built-in skills - use name as skill_id */
const ANTHROPIC_BUILTIN_SKILLS = new Set(['xlsx', 'pdf', 'docx']);

class SkillRegistry {
  private skills = new Map<string, SkillRegistryEntry>();
  private initialized = false;

  /**
   * Initialize registry from cache file.
   * Safe to call multiple times - idempotent after first load.
   *
   * @example
   * await skillRegistry.initialize('trace-123');
   * const id = skillRegistry.getSkillId('summarize');
   */
  initialize(traceId?: string): void {
    if (this.initialized) return;

    // Add built-in skills first
    for (const name of ANTHROPIC_BUILTIN_SKILLS) {
      this.skills.set(name, {
        name,
        skillId: name,  // Built-in skills use name as ID
        type: 'anthropic',
        version: 'latest',
      });
    }

    // Load custom skills from cache
    try {
      if (existsSync(CACHE_FILE_PATH)) {
        const cacheContent = readFileSync(CACHE_FILE_PATH, 'utf-8');
        const cache: SkillCache = JSON.parse(cacheContent);

        for (const [name, entry] of Object.entries(cache.skills)) {
          this.skills.set(name, {
            name,
            skillId: entry.skillId,
            type: 'custom',
            version: entry.latestVersion,
            contentHash: entry.contentHash,
            lastSynced: entry.lastSynced,
          });
        }

        logger.debug({
          event: 'skills.registry.initialized',
          traceId,
          customSkillCount: Object.keys(cache.skills).length,
          builtinSkillCount: ANTHROPIC_BUILTIN_SKILLS.size,
        });
      } else {
        logger.warn({
          event: 'skills.registry.cache_missing',
          traceId,
          message: 'Skill cache not found, registry initialized with built-in skills only',
        });
      }
    } catch (error) {
      logger.warn({
        event: 'skills.registry.cache_error',
        traceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load skill cache, registry initialized with built-in skills only',
      });
    }

    this.initialized = true;
  }

  /**
   * Get Anthropic skill ID for a local skill name.
   * Returns undefined if skill not found.
   */
  getSkillId(name: string): string | undefined {
    const entry = this.skills.get(name);
    return entry?.skillId;
  }

  /**
   * Get all available skill IDs for container parameter.
   */
  getAllSkillIds(): string[] {
    return Array.from(this.skills.values()).map(e => e.skillId);
  }

  /**
   * Get full metadata for a skill by ID.
   */
  getSkillMetadata(skillId: string): SkillRegistryEntry | undefined {
    for (const entry of this.skills.values()) {
      if (entry.skillId === skillId) return entry;
    }
    return undefined;
  }

  /**
   * Check if a skill is an Anthropic built-in.
   */
  isBuiltinSkill(name: string): boolean {
    return ANTHROPIC_BUILTIN_SKILLS.has(name);
  }

  /**
   * Get skills formatted for container parameter.
   */
  getContainerSkills(): ContainerSkillReference[] {
    return Array.from(this.skills.values()).map(entry => ({
      type: entry.type,
      skill_id: entry.skillId,  // snake_case for API
      version: entry.version,
    }));
  }

  /**
   * Refresh registry from cache file.
   * Use after sync-service updates the cache.
   */
  refresh(traceId?: string): void {
    this.skills.clear();
    this.initialized = false;
    this.initialize(traceId);

    logger.debug({
      event: 'skills.registry.refreshed',
      traceId,
      totalSkills: this.skills.size,
    });
  }

  /**
   * Check if registry has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get count of registered skills.
   */
  get size(): number {
    return this.skills.size;
  }

  // For testing
  _clear(): void {
    this.skills.clear();
    this.initialized = false;
  }
}

/** Singleton instance */
export const skillRegistry = new SkillRegistry();
```

### Usage Example in Agent Loop

**CURRENT STATE (Story 6.2):** Agent loop uses `getCachedSkillIds()` from sync-service:

```typescript
// src/agent/loop.ts (lines 644-656) - ALREADY IMPLEMENTED in Story 6.2
import { getCachedSkillIds, isSkillsInitialized } from '../skills/sync-service.js';
import { buildContainerParameter } from '../skills/container-builder.js';

if (isSkillsInitialized()) {
  const cachedSkillIds = getCachedSkillIds();  // Returns Record<string, string>
  const skillIdArray = Object.values(cachedSkillIds);
  if (skillIdArray.length > 0) {
    activeContainer = buildContainerParameter(skillIdArray);
  }
}
```

**AFTER Story 6.4:** Registry adds built-in skills + metadata:

```typescript
// FUTURE: Optional migration to registry (NOT required for Story 6.4)
import { skillRegistry } from '../skills/registry.js';
import { buildContainerParameter } from '../skills/container-builder.js';

// Registry wraps cache + adds built-in skills
skillRegistry.initialize(traceId);

// Now includes xlsx, pdf, docx even if no custom skills uploaded
const skillIds = skillRegistry.getAllSkillIds();
const container = buildContainerParameter(skillIds, existingContainerId);

// Check if a skill is built-in (e.g., for different handling)
if (skillRegistry.isBuiltinSkill('xlsx')) {
  // xlsx, pdf, docx are Anthropic-managed
}

// Get full metadata for a skill
const metadata = skillRegistry.getSkillMetadata('skill_01abc...');
// Returns: { name, skillId, type, version, contentHash?, lastSynced? }
```

**Note:** Migrating agent loop from `getCachedSkillIds()` to `skillRegistry` is OPTIONAL. The registry is useful when you need built-in skill support or metadata lookup.

### Cache File Format (from Story 6.2)

`.skills/.cache/skills.json`:

```json
{
  "skills": {
    "summarize": {
      "skillId": "skill_01AbCdEfGhIjKlMnOpQrStUv",
      "latestVersion": "1759178010641129",
      "contentHash": "sha256:abc123...",
      "lastSynced": "2026-01-07T10:30:00Z"
    },
    "algorithmic-art": {
      "skillId": "skill_02BcDeFgHiJkLmNoPqRsTuVw",
      "latestVersion": "1759178020641130",
      "contentHash": "sha256:def456...",
      "lastSynced": "2026-01-07T10:30:00Z"
    }
  }
}
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Cache file missing | Initialize with built-in skills only, log warning |
| Cache file corrupt (invalid JSON) | Initialize with built-in skills only, log warning |
| Unknown skill name | `getSkillId()` returns `undefined` |
| Empty cache | Registry contains only built-in skills |

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR24 | prd.md | Add new Skills via Agent Skills open standard |
| AR | architecture.md | Skills uploaded to Anthropic API, executed in managed container |
| Logging | project-context.md | ALL logs must include `traceId` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |

### Testing Requirements

**Minimum 12 tests:**

```typescript
// src/skills/registry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';

vi.mock('fs');
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SkillRegistry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset singleton state
    skillRegistry._clear();
  });

  describe('initialize', () => {
    it('loads built-in skills when cache missing', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      skillRegistry.initialize('test-trace');

      expect(skillRegistry.getSkillId('xlsx')).toBe('xlsx');
      expect(skillRegistry.getSkillId('pdf')).toBe('pdf');
      expect(skillRegistry.getSkillId('docx')).toBe('docx');
    });

    it('loads custom skills from cache file', () => {
      const mockCache = {
        skills: {
          summarize: {
            skillId: 'skill_01test',
            latestVersion: '123456',
            contentHash: 'sha256:abc',
            lastSynced: '2026-01-07T00:00:00Z',
          },
        },
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockCache));

      skillRegistry.initialize('test-trace');

      expect(skillRegistry.getSkillId('summarize')).toBe('skill_01test');
    });

    // ... more tests
  });
});
```

### Success Metrics

| Metric | Target |
|--------|--------|
| Registry init time | <50ms |
| Memory footprint | <1KB for 20 skills |
| Lookup time | O(1) via Map |
| Test coverage | >90% |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Call Skills API on every lookup | Use in-memory registry |
| Throw on missing cache | Return empty registry, log warning |
| Use raw fs paths | Use constant `CACHE_FILE_PATH` |
| Import without `.js` extension | Always use `.js` extension for ESM |
| Store skill content in registry | Store only metadata (IDs, versions) |
| Re-define `SkillCache` type | Import from `types.ts` (Story 6.2 owns it) |
| Duplicate `ContainerSkillReference` | Check if Story 6.3 already defined it — use existing |
| Replace `getCachedSkillIds()` in sync-service | Registry WRAPS cache, doesn't replace |
| Modify agent loop to use registry | That's optional — current code works fine |

### Built-in Skills Note

The hardcoded `ANTHROPIC_BUILTIN_SKILLS = ['xlsx', 'pdf', 'docx']` may become stale as Anthropic adds new built-in skills. This is acceptable tech debt because:

1. Built-in skills are rarely added
2. Custom skills are the primary use case
3. Updating the list is a one-line change
4. No API endpoint exists to query available built-in skills

If Anthropic adds a discovery API in the future, consider migrating to dynamic lookup.

### Conflict Prevention with Story 6.3

Story 6.3 may add `ContainerSkillReference` to `types.ts`.
**If implementing after Story 6.3:** USE the existing type definition — do NOT duplicate.

Check before adding types:
```bash
grep -n "ContainerSkillReference" src/skills/types.ts
```
If found, import it instead of defining it.

## Previous Story Intelligence

From Story 6.2 (`6-2-skills-api-client.md`):
- Cache file format: `.skills/.cache/skills.json`
- Types already defined: `SkillCache`, `ApiSkill`
- Beta headers consolidated in `config.anthropic.allBetas`

From Story 6.3 (`6-3-skills-container-config.md`):
- `ContainerSkillReference` type structure
- Container builder pattern
- Uses `skill_id` (snake_case) for API

From existing codebase:
- `src/skills/loader.ts` �� `loadSkillMetadata()` for local discovery
- `src/tools/mcp/manager.ts` — singleton pattern reference
- `src/skills/types.ts` — existing skill types to extend

## Git Intelligence

Recent commits:
- `975f6a5` — PTC support for Sonnet 4.5
- Beta header patterns established
- Anthropic SDK v0.71.x patterns in use

## References

- [Source: tech-spec-skills-migration-to-anthropic-container.md#Implementation-Plan] — Story 6.4 scope
- [Source: architecture.md#Anthropic-Skills-Files-API-Adoption] — ADR for skills migration
- [Source: project-context.md#TL;DR] — Critical implementation rules
- [Source: 6-2-skills-api-client.md] — Cache file format and types

## Dev Agent Record

### Implementation Plan

Followed red-green-refactor cycle:
1. **Task 1:** Added 3 types to `types.ts` — `SkillType`, `ContainerSkillReference`, `SkillRegistryEntry`
2. **RED phase:** Ran existing tests (29 tests) — all failed because registry.ts didn't exist
3. **GREEN phase:** Implemented `SkillRegistry` class with all required methods
4. **REFACTOR phase:** Added comprehensive JSDoc documentation

### Completion Notes

✅ **Story 6.4 Implementation Complete**

- Created `src/skills/registry.ts` with singleton `SkillRegistry` class
- Wraps sync-service cache file with built-in skill support (xlsx, pdf, docx)
- All 8 acceptance criteria satisfied
- 29 unit tests passing
- Full regression suite: 1301 tests passing

Key implementation decisions:
- Used `Set` for ANTHROPIC_BUILTIN_SKILLS for O(1) lookup
- Registry initialization is idempotent (safe to call multiple times)
- Graceful degradation: missing/corrupt cache → built-in skills only
- All logs include traceId for observability

### Senior Developer Review (AI)

**Review Date:** 2026-01-07
**Review Outcome:** Approved with fixes applied
**Issues Found:** 1 High, 2 Medium, 2 Low
**Issues Fixed:** 3 (all HIGH and MEDIUM)

#### Action Items (All Resolved)

- [x] **[HIGH]** Add secondary index for O(1) `getSkillMetadata()` lookup — was O(n) linear scan
- [x] **[MEDIUM]** Remove dead `SkillRegistryState` type from `types.ts` and `index.ts`
- [x] **[MEDIUM]** Remove unused `faker` import from `registry.test.ts`
- [ ] **[LOW]** Consider adding edge case test for concurrent `refresh()` calls (optional)
- [ ] **[LOW]** Minor doc clarification on Task 1.3 vs actual implementation (optional)

### Debug Log

- No blockers encountered
- Tests already existed from previous implementation attempt
- Clean implementation following story Dev Notes exactly
- Code review: Added `skillIdIndex` Map for O(1) lookups, removed dead code

## File List

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/skills/registry.ts` | Skill registry service with O(1) secondary index (~260 lines) |
| MODIFY | `src/skills/types.ts` | Added 3 types for registry (lines 187-227) |
| MODIFY | `src/skills/index.ts` | Exported new types and registry singleton |
| MODIFY | `src/skills/registry.test.ts` | 29 unit tests, removed unused faker import |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - Skill Registry Service for centralized skill ID mapping |
| 2026-01-07 | **SM Validation #1:** (1) Enhanced dependency section with BLOCKING status and pre-implementation checklist, (2) Added import clarification for Story 6.2 types, (3) Added conflict prevention note for Story 6.3 `ContainerSkillReference` type |
| 2026-01-07 | **SM Validation #2 (Adversarial):** (1) **CRITICAL:** Clarified relationship with `sync-service.ts` — registry WRAPS cache, does NOT replace `getCachedSkillIds()`, (2) Updated story narrative to reflect "extends" not "implements from scratch", (3) Added current agent loop code example showing existing implementation, (4) Added anti-patterns for avoiding duplication with sync-service, (5) Added built-in skills tech debt note, (6) Updated dependency status to reflect Story 6.2 `ready-for-review`, (7) Added pre-implementation checks for `SkillType` and `ContainerSkillReference` to avoid type conflicts |
| 2026-01-07 | **Dev Implementation:** Story complete — registry.ts created, all 29 tests passing, full regression (1301 tests) passing. Status changed to `review` |
| 2026-01-07 | **Code Review:** Adversarial review found 1 HIGH + 2 MEDIUM issues. Fixed all: (1) Added secondary index for O(1) getSkillMetadata() lookup, (2) Removed dead SkillRegistryState type, (3) Removed unused faker import. All 1301 tests pass. Status → `done` |
