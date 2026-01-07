# ATDD Checklist: Story 6.2 - Skills API Client

**Story:** Skills API Client for Anthropic Container Integration
**Status:** Tests Generated (RED phase)
**Generated:** 2026-01-07
**Test Framework:** Vitest 1.6.0

---

## Overview

This checklist tracks the ATDD red-green-refactor cycle for Story 6.2. All tests have been generated in the RED phase — they will fail until implementation is complete.

---

## Test Files Created

| File | Test Count | Status |
|------|------------|--------|
| `src/skills/api-client.test.ts` | 12 | 🔴 RED |
| `src/skills/sync-service.test.ts` | 14 | 🔴 RED |
| `src/skills/container-builder.test.ts` | 10 | 🔴 RED |
| `src/skills/init.test.ts` | 11 | 🔴 RED |
| `src/agent/loop.test.ts` (additions) | 10 | 🔴 RED |
| `src/config/environment.test.ts` (additions) | 9 | 🔴 RED |
| `tests/factories/skills-factory.ts` | N/A (helpers) | ✅ Created |

**Total New Tests:** ~66

---

## Acceptance Criteria Coverage

### AC#1: Skills uploaded at startup, IDs cached
- [ ] `sync-service.test.ts` → `uploads new skills when cache is empty`
- [ ] `sync-service.test.ts` → `uses cached skill IDs when content unchanged`
- [ ] `sync-service.test.ts` → `uploads skills in parallel within rate limits`
- [ ] `init.test.ts` → `calls syncSkills on startup`
- [ ] `init.test.ts` → `sets skillsInitialized flag to true on success`

### AC#2: Container param includes skills + code_execution tool
- [ ] `container-builder.test.ts` → `returns container with custom skills array`
- [ ] `container-builder.test.ts` → `returns undefined when no skill IDs provided`
- [ ] `container-builder.test.ts` → `reuses container ID across turns`
- [ ] `container-builder.test.ts` → `supports both custom and anthropic-managed skills`

### AC#3: Listed skills have correct metadata and version
- [ ] `api-client.test.ts` → `returns custom skills when source is custom`
- [ ] `api-client.test.ts` → `returns anthropic-managed skills when source is anthropic`
- [ ] `api-client.test.ts` → `retrieves skill by ID with metadata`

### AC#4: Modified SKILL.md creates new version (not new skill)
- [ ] `sync-service.test.ts` → `creates new version when content hash differs`
- [ ] `sync-service.test.ts` → `creates new skill when cached skill no longer exists in API`

### AC#5: Beta headers consolidated in config.anthropic.allBetas
- [ ] `api-client.test.ts` → `uses skills-2025-10-02 beta for Skills API calls`
- [ ] `environment.test.ts` → `should have consolidated allBetas array`
- [ ] `environment.test.ts` → `should include existing betas`
- [ ] `environment.test.ts` → `should include new skills-related betas`
- [ ] `environment.test.ts` → `should have exactly 5 consolidated betas`
- [ ] `environment.test.ts` → `should produce valid comma-separated header string`

### AC#6: Langfuse captures upload metrics
- [ ] `init.test.ts` → `creates Langfuse span for skill initialization`
- [ ] `init.test.ts` → `logs skill initialization metrics`
- [ ] `api-client.test.ts` → `emits Langfuse event on rate limit (429)`
- [ ] `api-client.test.ts` → `emits Langfuse event on API unavailable`

### AC#7: ANTHROPIC_SKILLS_ENABLED=false skips upload
- [ ] `init.test.ts` → `skips initialization when ANTHROPIC_SKILLS_ENABLED=false`
- [ ] `init.test.ts` → `sets skillsInitialized to false when disabled`
- [ ] `environment.test.ts` → `should default skillsEnabled to true`
- [ ] `environment.test.ts` → `should disable skills when ANTHROPIC_SKILLS_ENABLED=false`

### AC#8: pause_turn stop reason continues conversation
- [ ] `loop.test.ts` → `should continue conversation when stop_reason is pause_turn`
- [ ] `loop.test.ts` → `should preserve container ID across pause_turn continuation`
- [ ] `loop.test.ts` → `should handle multiple pause_turn cycles`
- [ ] `loop.test.ts` → `should log pause_turn continuation with traceId`

### AC#9: extractFileIds() parses file IDs from results
- [ ] `loop.test.ts` → `should extract file IDs from bash_code_execution_tool_result`
- [ ] `loop.test.ts` → `extracts file_id from code_execution_tool_result content block`
- [ ] `loop.test.ts` → `returns empty array when no file_ids present`
- [ ] `loop.test.ts` → `handles nested content blocks`

---

## Implementation Files Required

| Task | File | Action |
|------|------|--------|
| 1.1-1.8 | `src/skills/api-client.ts` | CREATE |
| 2.1-2.8 | `src/skills/sync-service.ts` | CREATE |
| 3.1-3.5 | `src/skills/container-builder.ts` | CREATE |
| 4.1-4.8 | `src/agent/loop.ts` | MODIFY |
| 5.1-5.5 | `src/skills/init.ts` | CREATE |
| 6.1-6.5 | `src/config/environment.ts` | MODIFY |
| — | `src/skills/types.ts` | MODIFY (add new types) |
| — | `src/skills/index.ts` | MODIFY (re-exports) |
| — | `.env.example` | MODIFY |

---

## Test Factories Created

Located in `tests/factories/skills-factory.ts`:

### Data Factories
- `createApiSkill(overrides)` — API skill response
- `createApiSkills(count)` — Multiple API skills
- `createApiSkillVersion(overrides)` — Skill version
- `createSkillCacheEntry(overrides)` — Cache entry
- `createSkillCache(params)` — Full cache structure
- `createContainerParameter(overrides)` — Container param
- `createSkillFiles(skillName)` — Upload files
- `createSkillFilesWithScripts(skillName)` — With Python scripts
- `createSkillGeneratedFile(overrides)` — Generated file ref
- `createSyncResult(overrides)` — Sync operation result

### Mock Helpers
- `createMockStreamWithContainer(params)` — Stream with container
- `createMockStreamWithPauseTurn(params)` — pause_turn stream
- `createMockCodeExecutionResultWithFiles(params)` — Code result with files

### ID Generators
- `createSkillId()` — `skill_...` format
- `createSkillName()` — `snake_case` name
- `createEpochVersion()` — Epoch timestamp
- `createContainerId()` — Container ID

---

## Running Tests

```bash
# Run all Story 6.2 tests (will fail in RED phase)
npx vitest run src/skills/api-client.test.ts \
               src/skills/sync-service.test.ts \
               src/skills/container-builder.test.ts \
               src/skills/init.test.ts

# Run with coverage
npx vitest run --coverage src/skills/

# Watch mode during implementation
npx vitest src/skills/ --watch
```

---

## RED → GREEN → REFACTOR Workflow

### Phase 1: RED (Current)
- [x] Tests generated from acceptance criteria
- [x] All tests should fail (modules don't exist yet)
- [x] Test factories created
- [x] Checklist document produced

### Phase 2: GREEN (Next)
- [ ] Implement `src/skills/api-client.ts` (Task 1)
- [ ] Implement `src/skills/sync-service.ts` (Task 2)
- [ ] Implement `src/skills/container-builder.ts` (Task 3)
- [ ] Modify `src/agent/loop.ts` (Task 4)
- [ ] Implement `src/skills/init.ts` (Task 5)
- [ ] Modify `src/config/environment.ts` (Task 6)
- [ ] All tests pass

### Phase 3: REFACTOR
- [ ] Review code for DRY violations
- [ ] Ensure error handling is consistent
- [ ] Optimize parallel uploads if needed
- [ ] Documentation updated

---

## Notes

- **SDK Imports:** Use `toFile()` helper from `@anthropic-ai/sdk` for file uploads (see story dev notes)
- **Beta Headers:** All beta headers consolidated in `config.anthropic.allBetas` array
- **Error Handling:** API errors emit Langfuse events, don't crash startup
- **Cache Location:** `.skills/.cache/skills.json`
- **Max Skills:** 8 per request (enforced in container-builder)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skills API beta changes | Medium | Pin beta header versions |
| Rate limiting on upload | Low | Exponential backoff + parallel limits |
| Cold start latency | Low | Async startup, ~1-3s budget |
| Cache corruption | Low | Graceful regeneration |
