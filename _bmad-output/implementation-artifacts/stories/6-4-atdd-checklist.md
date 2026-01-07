# ATDD Checklist - Epic 6, Story 4: Skill Registry Service

**Date:** 2026-01-07
**Author:** Sid (via TEA Agent Murat)
**Primary Test Level:** Unit Tests (Vitest)

---

## Story Summary

Centralized skill registry that extends the existing sync-service cache with Anthropic built-in skill support and metadata lookup capabilities.

**As a** developer,
**I want** a centralized skill registry that adds Anthropic built-in skill support and metadata lookup capabilities to the existing sync-service cache,
**So that** the agent loop can include both custom and built-in skills without code changes.

---

## Acceptance Criteria

1. **AC#1**: Given the skill cache file exists, When registry initializes, Then all skill mappings are loaded into memory
2. **AC#2**: Given a local skill name, When calling `getSkillId(name)`, Then returns the corresponding Anthropic skill ID or `undefined`
3. **AC#3**: Given an Anthropic built-in skill name (e.g., "xlsx"), When calling `getSkillId("xlsx")`, Then returns "xlsx" directly (built-in skills use name as ID)
4. **AC#4**: Given the registry is initialized, When calling `getAllSkillIds()`, Then returns array of all available skill IDs (custom + built-in)
5. **AC#5**: Given a skill ID, When calling `getSkillMetadata(skillId)`, Then returns full metadata including name, version, type, and last sync timestamp
6. **AC#6**: Given cache file is missing or corrupt, When registry initializes, Then initializes empty and logs warning (non-blocking)
7. **AC#7**: Given the sync service updates the cache, When calling `refresh()`, Then registry reloads from cache file
8. **AC#8**: Given observability requirements, When registry operations occur, Then appropriate debug logs are emitted with traceId

---

## Failing Tests Created (RED Phase)

### Unit Tests (29 tests)

**File:** `src/skills/registry.test.ts` (380 lines)

#### initialize (AC#1, AC#8)

- **Test:** loads skills from valid cache file
  - **Status:** RED - Failed to load url ./registry.js — Does the file exist?
  - **Verifies:** Cache file loaded into memory on initialization

- **Test:** is idempotent - multiple calls do not reload
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Second initialize() call is no-op

- **Test:** logs debug event on successful initialization
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Debug log with traceId emitted

#### error handling (AC#6)

- **Test:** initializes with built-in skills only when cache file missing
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Graceful handling, built-in skills available

- **Test:** initializes with built-in skills only when cache file is corrupt
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Invalid JSON handled gracefully

- **Test:** does not throw on initialization failure
  - **Status:** RED - registry.js does not exist
  - **Verifies:** No exceptions thrown on error

#### getSkillId (AC#2)

- **Test:** returns skill ID for custom skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Custom skill lookup works

- **Test:** returns undefined for unknown skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Unknown skills return undefined

#### built-in skills (AC#3)

- **Test:** returns xlsx for xlsx built-in skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** xlsx uses name as ID

- **Test:** returns pdf for pdf built-in skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** pdf uses name as ID

- **Test:** returns docx for docx built-in skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** docx uses name as ID

#### isBuiltinSkill

- **Test:** returns true for xlsx
- **Test:** returns true for pdf
- **Test:** returns true for docx
- **Test:** returns false for custom skill
- **Test:** returns false for unknown skill
  - **Status:** All RED - registry.js does not exist
  - **Verifies:** Helper correctly identifies built-in vs custom skills

#### getAllSkillIds (AC#4)

- **Test:** returns built-in skills when cache is empty
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Built-in skills always included

- **Test:** returns custom skills combined with built-in skills
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Custom + built-in skills combined

#### getSkillMetadata (AC#5)

- **Test:** returns full metadata for custom skill by ID
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Full metadata returned (name, skillId, type, version, contentHash, lastSynced)

- **Test:** returns metadata for built-in skill
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Built-in skill metadata (type: 'anthropic', version: 'latest')

- **Test:** returns undefined for unknown skill ID
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Unknown IDs return undefined

#### refresh (AC#7)

- **Test:** reloads skills from cache file
  - **Status:** RED - registry.js does not exist
  - **Verifies:** New cache data loaded after refresh

- **Test:** clears existing entries before reload
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Old entries cleared on refresh

- **Test:** logs debug event on refresh
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Debug log with traceId on refresh

#### getContainerSkills (Task 4)

- **Test:** returns ContainerSkillReference array with correct structure
  - **Status:** RED - registry.js does not exist
  - **Verifies:** API-ready structure with snake_case `skill_id`

- **Test:** uses correct type field for custom vs anthropic skills
  - **Status:** RED - registry.js does not exist
  - **Verifies:** type: 'custom' vs 'anthropic' correct

- **Test:** uses version from cache for custom skills
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Version from cache used (not 'latest')

#### singleton behavior

- **Test:** exports singleton instance
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Same instance exported

#### size property

- **Test:** returns total count of registered skills
  - **Status:** RED - registry.js does not exist
  - **Verifies:** Size = custom + built-in count

---

## Data Factories (Existing)

### Skills Factory

**File:** `tests/factories/skills-factory.ts`

**Exports:**
- `createSkillCache(params?)` - Create skill cache with random or specific skill names
- `createSkillCacheEntry(overrides?)` - Create single cache entry
- `createApiSkill(overrides?)` - Create API skill response
- `createSkillId()` - Generate realistic skill_01... ID
- `createEpochVersion()` - Generate epoch timestamp version

**Example Usage:**

```typescript
import { createSkillCache, createSkillCacheEntry } from '../../../tests/factories/skills-factory';

// Cache with specific skills
const cache = createSkillCache({ skillNames: ['summarize', 'research'] });

// Single entry with overrides
const entry = createSkillCacheEntry({ skillId: 'skill_test123' });
```

---

## Fixtures (N/A)

No new fixtures required. Tests use `vi.mock()` for fs and logger dependencies following existing patterns in `sync-service.test.ts`.

---

## Mock Requirements

### File System Mock

**Already configured in tests:**
```typescript
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));
```

- `existsSync` - Returns true/false for cache file existence
- `readFileSync` - Returns cache JSON or throws for error scenarios

### Logger Mock

**Already configured in tests:**
```typescript
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));
```

---

## Required Types to Add

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

---

## Implementation Checklist

### Task 1: Registry Types (AC: #2, #4, #5)

**File:** `src/skills/types.ts`

**Tasks to make these tests pass:**
- [ ] Add `SkillType` union type: `'custom' | 'anthropic'`
- [ ] Add `SkillRegistryEntry` interface with name, skillId, type, version, contentHash?, lastSynced?
- [ ] Add `ContainerSkillReference` interface with type, skill_id (snake_case), version
- [ ] Export all new types

**Estimated Effort:** 0.5 hours

---

### Task 2: Registry Core Implementation (AC: #1, #2, #3, #4, #5, #6)

**File:** `src/skills/registry.ts` (CREATE)

**Tasks to make tests pass:**

- [ ] **2.1** Create `SkillRegistry` class with singleton pattern
- [ ] **2.2** Add `CACHE_FILE_PATH = '.skills/.cache/skills.json'` constant
- [ ] **2.3** Add `ANTHROPIC_BUILTIN_SKILLS = new Set(['xlsx', 'pdf', 'docx'])` constant
- [ ] **2.4** Implement private `skills = new Map<string, SkillRegistryEntry>()`
- [ ] **2.5** Implement private `initialized = false` flag
- [ ] **2.6** Implement `initialize(traceId?: string): void`
  - Add built-in skills first (xlsx, pdf, docx with type: 'anthropic', version: 'latest')
  - If cache file exists, load and parse JSON
  - For each cached skill, add to Map with type: 'custom'
  - Log debug event with traceId and counts
  - Set initialized = true
- [ ] **2.7** Handle missing cache file (log warning, continue with built-in only)
- [ ] **2.8** Handle corrupt JSON (log warning, continue with built-in only)
- [ ] **2.9** Implement `getSkillId(name: string): string | undefined`
- [ ] **2.10** Implement `isBuiltinSkill(name: string): boolean`
- [ ] **2.11** Implement `getAllSkillIds(): string[]`
- [ ] **2.12** Implement `getSkillMetadata(skillId: string): SkillRegistryEntry | undefined`
- [ ] **2.13** Add JSDoc with usage examples

**Run tests:** `npx vitest run src/skills/registry.test.ts`
- [ ] Tests for initialize, getSkillId, isBuiltinSkill, getAllSkillIds, getSkillMetadata pass (green phase)

**Estimated Effort:** 2 hours

---

### Task 3: Registry Refresh (AC: #7, #8)

**File:** `src/skills/registry.ts`

**Tasks to make tests pass:**

- [ ] **3.1** Implement `refresh(traceId?: string): void`
  - Clear `skills.clear()`
  - Set `initialized = false`
  - Call `initialize(traceId)`
  - Log debug event with traceId and totalSkills

**Run tests:** `npx vitest run src/skills/registry.test.ts --grep "refresh"`
- [ ] Refresh tests pass (green phase)

**Estimated Effort:** 0.5 hours

---

### Task 4: Container Skills Helper (AC: #4)

**File:** `src/skills/registry.ts`

**Tasks to make tests pass:**

- [ ] **4.1** Implement `getContainerSkills(): ContainerSkillReference[]`
  - Map all skills to `{ type, skill_id, version }` format
  - Use snake_case `skill_id` for API compatibility
- [ ] **4.2** Ensure correct `type` field ('custom' vs 'anthropic')
- [ ] **4.3** Use version from cache for custom skills

**Run tests:** `npx vitest run src/skills/registry.test.ts --grep "getContainerSkills"`
- [ ] getContainerSkills tests pass (green phase)

**Estimated Effort:** 0.5 hours

---

### Task 5: Singleton Export and Testing Helpers

**File:** `src/skills/registry.ts`

**Tasks:**

- [ ] **5.1** Export singleton: `export const skillRegistry = new SkillRegistry()`
- [ ] **5.2** Add `isInitialized(): boolean` getter
- [ ] **5.3** Add `get size(): number` property
- [ ] **5.4** Add `_clear(): void` for testing (reset internal state)

**Run tests:** `npx vitest run src/skills/registry.test.ts`
- [ ] All tests pass (green phase)

**Estimated Effort:** 0.25 hours

---

### Task 6: Re-export from Index

**File:** `src/skills/index.ts`

**Tasks:**

- [ ] **6.1** Add export for `skillRegistry`
- [ ] **6.2** Add type exports for `SkillType`, `SkillRegistryEntry`, `ContainerSkillReference`

**Estimated Effort:** 0.1 hours

---

## Running Tests

```bash
# Run all failing tests for this story
npx vitest run src/skills/registry.test.ts

# Run specific test suite
npx vitest run src/skills/registry.test.ts --grep "initialize"
npx vitest run src/skills/registry.test.ts --grep "getSkillId"
npx vitest run src/skills/registry.test.ts --grep "built-in"
npx vitest run src/skills/registry.test.ts --grep "refresh"
npx vitest run src/skills/registry.test.ts --grep "getContainerSkills"

# Run tests in watch mode
npx vitest src/skills/registry.test.ts

# Run with coverage
npx vitest run src/skills/registry.test.ts --coverage
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**
- [x] All tests written and failing (29 tests)
- [x] Tests follow Given-When-Then format
- [x] Mock dependencies configured (fs, logger)
- [x] Implementation checklist created
- [x] Types documented for addition

**Verification:**
- All 29 tests fail with: "Failed to load url ./registry.js — Does the file exist?"
- Failures are due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Start with types** (Task 1) — add SkillType, SkillRegistryEntry, ContainerSkillReference to types.ts
2. **Create registry.ts** with basic structure (Task 2.1-2.5)
3. **Implement initialize()** (Task 2.6-2.8) — run tests after each step
4. **Implement getters** (Task 2.9-2.12)
5. **Implement refresh()** (Task 3)
6. **Implement getContainerSkills()** (Task 4)
7. **Add exports** (Task 5-6)

**Key Principles:**
- One task at a time (don't try to fix all at once)
- Run tests frequently (`npx vitest run src/skills/registry.test.ts`)
- Check off tasks as you complete them

**Progress Tracking:**
- Check off tasks as you complete them
- Share progress in daily standup

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (29/29 green)
2. **Review code for quality:**
   - ESM imports use `.js` extension
   - All logs include `traceId`
   - Singleton pattern correctly implemented
3. **Ensure tests still pass** after each refactor

---

## Next Steps

1. **Review this checklist** with team
2. **Run failing tests** to confirm RED phase: `npx vitest run src/skills/registry.test.ts`
3. **Begin implementation** using Task 1-6 as guide
4. **Work one test at a time** (red -> green for each)
5. **When all tests pass**, run full test suite: `npx vitest run`
6. **Update story status** to 'in-progress' in sprint-status.yaml

---

## Knowledge Base References Applied

- **data-factories.md** — Used existing factory patterns from `skills-factory.ts`
- **test-quality.md** — Given-When-Then format, one assertion per test, atomic tests
- **Project conventions** — ESM imports with `.js`, traceId in logs, Vitest patterns

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/skills/registry.test.ts`

**Results:**
```
 ❯ src/skills/registry.test.ts  (29 tests | 29 failed) 27ms
```

**Summary:**
- Total tests: 29
- Passing: 0 (expected)
- Failing: 29 (expected)
- Status: RED phase verified

**Expected Failure Messages:**
- "Failed to load url ./registry.js (resolved id: ./registry.js) — Does the file exist?"

All failures are due to missing `registry.js` implementation, not test bugs.

---

## Notes

- **Built-in skills are hardcoded:** `xlsx`, `pdf`, `docx` — acceptable tech debt per story notes
- **Registry WRAPS cache**, does NOT replace `getCachedSkillIds()` in sync-service
- **Migration to registry in agent loop is OPTIONAL** — current code works fine
- **Check for type conflicts:** If Story 6.3 already added `ContainerSkillReference`, import it instead of redefining

---

## Contact

**Questions or Issues?**
- Review Story 6.4: `_bmad-output/implementation-artifacts/stories/6-4-skill-registry-service.md`
- Refer to existing patterns: `src/skills/sync-service.ts`, `src/skills/sync-service.test.ts`
- Consult project-context.md for coding rules

---

**Generated by TEA Agent (Murat)** - 2026-01-07
