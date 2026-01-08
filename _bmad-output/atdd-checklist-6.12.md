# ATDD Checklist - Story 6.12: GKE Sandbox Scope Reduction

**Date:** 2026-01-07
**Author:** Sid
**Primary Test Level:** Unit Tests (Vitest)

---

## Story Summary

Reduce GKE Agent Sandbox scope to only edge-case skills (webapp-testing, web-artifacts-builder), formalizing the "fallback only" status now that 90% of skills run in Anthropic's container.

**As a** platform developer
**I want** to reduce GKE sandbox scope to only edge-case skills
**So that** infrastructure cost and complexity are minimized while supporting skills that genuinely require Playwright or local filesystem access

---

## Acceptance Criteria

1. **AC#1** - Non-GKE skills rejected: Given any skill NOT in `GKE_ONLY_SKILLS`, when someone attempts to execute via `orion_sandbox` (skill_doc or skill_script), then error `SKILL_NOT_GKE` returned directing to PTC

2. **AC#2** - GKE skills allowed: Given a skill in `GKE_ONLY_SKILLS`, when executed via `orion_sandbox`, then it executes successfully

3. **AC#3** - Allowlist exports: Given `allowed-skills.ts`, when inspected, then it exports `GKE_ONLY_SKILLS`, `isGkeOnlySkill()`, and `GkeOnlySkill` type

4. **AC#4** - Documentation updated: Given README.md, when read, then it states "Fallback Only" for edge-case skills

5. **AC#5** - Warm pool reduced: Given GKE config, when deployed, then replicas = 1

6. **AC#6** - DRY principle: Given `upload-skills.ts`, when inspected, then it imports from `allowed-skills.ts` (no hardcoded WARN_SKILLS)

7. **AC#7** - Tests pass: Given all tests, when running `pnpm test`, then sandbox tests verify allowlist enforcement

---

## Failing Tests Created (RED Phase)

### Unit Tests (8 tests)

**File:** `src/tools/orion-sandbox/allowed-skills.test.ts` (~50 lines)

| Test | Status | Failure Reason | Verifies |
|------|--------|----------------|----------|
| `GKE_ONLY_SKILLS contains exactly webapp-testing and web-artifacts-builder` | RED | Module not found | AC#3 |
| `isGkeOnlySkill returns true for webapp-testing` | RED | Module not found | AC#3 |
| `isGkeOnlySkill returns true for web-artifacts-builder` | RED | Module not found | AC#3 |
| `isGkeOnlySkill returns false for Anthropic-hosted skills` | RED | Module not found | AC#3 |
| `isGkeOnlySkill returns false for unknown skills` | RED | Module not found | AC#3 |

**File:** `src/tools/orion-sandbox/tool.test.ts` additions (~80 lines)

| Test | Status | Failure Reason | Verifies |
|------|--------|----------------|----------|
| `rejects non-GKE skills via skill_doc with SKILL_NOT_GKE error` | RED | Validation not implemented | AC#1 |
| `rejects non-GKE skills via skill_script with SKILL_NOT_GKE error` | RED | Validation not implemented | AC#1 |
| `accepts GKE-only skills via skill_doc` | RED | Validation blocks valid skills | AC#2 |

---

## Data Factories Created

### Existing Factory Reuse

**File:** `tests/factories/skills-factory.ts`

The existing `createApiSkill()` and skill factories will be reused. No new factories needed for this story since we're testing hardcoded allowlist values.

**Example Usage:**
```typescript
import { createSkillMetadata } from '../../../tests/factories/skills-factory';

// Create a non-GKE skill for rejection tests
const nonGkeSkill = createSkillMetadata({ name: 'summarize' });

// Create a GKE skill for acceptance tests
const gkeSkill = createSkillMetadata({ name: 'webapp-testing' });
```

---

## Fixtures Created

No new fixtures needed. This story tests pure functions (`isGkeOnlySkill`) and adds validation logic to existing handler (`orionSandboxHandler`) which already has comprehensive test fixtures.

---

## Mock Requirements

### Existing Mocks (Reused)

- `sandboxClient.executeSandbox` — Already mocked in `tool.test.ts`
- `skillsLoader.getSkillMetadata` — Already mocked in `tool.test.ts`
- `fs/promises.readFile` — Already mocked in `tool.test.ts`

No new external service mocks required.

---

## Required data-testid Attributes

Not applicable — this story is purely backend/API changes with no UI components.

---

## Implementation Checklist

### Test: GKE_ONLY_SKILLS contains exactly webapp-testing and web-artifacts-builder

**File:** `src/tools/orion-sandbox/allowed-skills.test.ts`

**Tasks to make this test pass:**
- [ ] Create `src/tools/orion-sandbox/allowed-skills.ts`
- [ ] Export `GKE_ONLY_SKILLS` as `['webapp-testing', 'web-artifacts-builder'] as const`
- [ ] Export `GkeOnlySkill` type from const array
- [ ] Run test: `pnpm test allowed-skills`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Test: isGkeOnlySkill returns correct values

**File:** `src/tools/orion-sandbox/allowed-skills.test.ts`

**Tasks to make this test pass:**
- [ ] Implement `isGkeOnlySkill(skillName: string): skillName is GkeOnlySkill`
- [ ] Use type-safe `.includes()` check with `as readonly string[]` cast
- [ ] Add JSDoc with criteria explanation
- [ ] Run test: `pnpm test allowed-skills`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Test: rejects non-GKE skills via skill_doc with SKILL_NOT_GKE error

**File:** `src/tools/orion-sandbox/tool.test.ts`

**Tasks to make this test pass:**
- [ ] Import `isGkeOnlySkill`, `GKE_ONLY_SKILLS` from `./allowed-skills.js`
- [ ] Add `extractSkillName()` helper function
- [ ] Add validation check for `skill_doc` before processing (line ~225)
- [ ] Return `SKILL_NOT_GKE` error with helpful message
- [ ] Add `SKILL_NOT_GKE` to `ToolErrorCode` type if needed
- [ ] Run test: `pnpm test tool.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

---

### Test: rejects non-GKE skills via skill_script with SKILL_NOT_GKE error

**File:** `src/tools/orion-sandbox/tool.test.ts`

**Tasks to make this test pass:**
- [ ] Add validation check for `skill_script` before processing (line ~163)
- [ ] Reuse `extractSkillName()` helper
- [ ] Return same `SKILL_NOT_GKE` error format
- [ ] Run test: `pnpm test tool.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Test: accepts GKE-only skills via skill_doc

**File:** `src/tools/orion-sandbox/tool.test.ts`

**Tasks to make this test pass:**
- [ ] Ensure validation passes for `webapp-testing` and `web-artifacts-builder`
- [ ] Test should use existing mocked execution path
- [ ] Run test: `pnpm test tool.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Configuration: upload-skills.ts DRY refactor

**File:** `scripts/upload-skills.ts`

**Tasks:**
- [ ] Remove hardcoded `WARN_SKILLS` constant (line ~46)
- [ ] Import `GKE_ONLY_SKILLS` from `../src/tools/orion-sandbox/allowed-skills.js`
- [ ] Update warn logic to use `new Set(GKE_ONLY_SKILLS)`
- [ ] Run test: `pnpm test upload-skills`
- [ ] ✅ Tests pass (green phase)

**Estimated Effort:** 0.25 hours

---

### Infrastructure: Warm pool reduction

**File:** `infra/gke-sandbox/sandbox-template-and-pool.yaml`

**Tasks:**
- [ ] Update `replicas: 2` to `replicas: 1`
- [ ] Add comment: `# Reduced from 2 (2026-01-07) - fallback-only usage`
- [ ] Apply: `kubectl apply -f infra/gke-sandbox/sandbox-template-and-pool.yaml`
- [ ] Verify: `kubectl get sandboxwarmpools`
- [ ] ✅ Warm pool running with 1 replica

**Estimated Effort:** 0.25 hours

---

### Documentation: README update

**File:** `infra/gke-sandbox/README.md`

**Tasks:**
- [ ] Update header to "GKE Agent Sandbox Infrastructure (Fallback Only)"
- [ ] Add status banner with migration context
- [ ] Add "Skills Migration Context" section
- [ ] Update cost section with before/after comparison
- [ ] ✅ Documentation reflects fallback status

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all tests for this story
pnpm test orion-sandbox

# Run specific test files
pnpm test allowed-skills
pnpm test tool.test.ts
pnpm test upload-skills

# Run with coverage
pnpm test --coverage

# Run in watch mode during development
pnpm test --watch orion-sandbox
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**
- ✅ All tests specified and will fail initially
- ✅ Test structure follows existing patterns in `tool.test.ts`
- ✅ Mock requirements documented (reuse existing)
- ✅ Implementation checklist created

**Verification:**
- Tests will fail with `Cannot find module` (allowed-skills.ts doesn't exist)
- Tests will fail with `expected SKILL_NOT_GKE` (validation not implemented)
- Failures are due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with `allowed-skills.ts` creation)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Check off the task** in implementation checklist
6. **Move to next test** and repeat

**Recommended Order:**
1. Create `allowed-skills.ts` with exports (5 tests pass)
2. Add validation to `tool.ts` for `skill_script` (1 test passes)
3. Add validation to `tool.ts` for `skill_doc` (1 test passes)
4. Ensure GKE skills still work (1 test passes)
5. Refactor `upload-skills.ts` to import from allowlist
6. Update infrastructure and documentation

**Key Principles:**
- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** — especially ESM imports with `.js` extension
3. **Check for DRY violations** — `GKE_ONLY_SKILLS` should be single source of truth
4. **Verify no regressions** — existing tool.test.ts tests still pass
5. **Ensure tests still pass** after each refactor

**Completion:**
- All 8+ tests pass
- Code follows project-context.md conventions
- `pnpm test` shows no failures
- Ready for code review

---

## Next Steps

1. **Review this checklist** with team
2. **Run failing tests** to confirm RED phase: `pnpm test orion-sandbox`
3. **Begin implementation** using checklist as guide
4. **Work one test at a time** (red → green for each)
5. **When all tests pass**, manually update story status to 'done' in sprint-status.yaml

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **test-quality.md** — Test design principles (deterministic, isolated, explicit assertions)
- **data-factories.md** — Factory patterns (reused existing `skills-factory.ts`)

No E2E or component tests needed — this is pure backend logic with unit test coverage.

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `pnpm test allowed-skills` and `pnpm test tool.test.ts`

**Actual Results:**

**allowed-skills.test.ts:**
```
 FAIL  src/tools/orion-sandbox/allowed-skills.test.ts
Error: Failed to load url ./allowed-skills.js (resolved id: ./allowed-skills.js)
Does the file exist?
```

**tool.test.ts (GKE enforcement tests):**
```
 ❯ GKE-only skill enforcement (Story 6.12) > skill_doc rejection (AC#1)
   > rejects non-GKE skills via skill_doc with SKILL_NOT_GKE error
   → expected true to be false // Object.is equality

 ❯ GKE-only skill enforcement (Story 6.12) > skill_doc rejection (AC#1)
   > rejects xlsx skill via skill_doc (migrated to Anthropic)
   → expected true to be false // Object.is equality

 ❯ GKE-only skill enforcement (Story 6.12) > skill_script rejection (AC#1)
   > rejects non-GKE skills via skill_script with SKILL_NOT_GKE error
   → expected true to be false // Object.is equality

 ❯ GKE-only skill enforcement (Story 6.12) > skill_script rejection (AC#1)
   > rejects skill_script without skill: prefix for non-GKE skills
   → expected true to be false // Object.is equality

 ❯ GKE-only skill enforcement (Story 6.12) > error message quality (AC#1)
   > includes helpful migration guidance in error message
   → expected true to be false // Object.is equality
```

**Summary:**
- **allowed-skills.test.ts:** 7 tests (all fail — module doesn't exist)
- **tool.test.ts GKE rejection tests:** 5 tests (all fail — validation not implemented)
- **tool.test.ts GKE acceptance tests:** 3 tests (pass — but need validation to work correctly)
- **Total NEW tests:** 15
- **Status:** ✅ RED phase verified

---

## Notes

- **Blocking Gate:** Story 6.10 MUST be `done` before starting implementation
- **Error Code:** `SKILL_NOT_GKE` may need to be added to `ToolErrorCode` type in `tool-result.ts`
- **Import Pattern:** All imports MUST use `.js` extension per project-context.md
- **Single Source of Truth:** After this story, `allowed-skills.ts` is the ONLY place GKE skills are defined

---

## Contact

**Questions or Issues?**
- Consult `project-context.md` for implementation rules
- Check existing `tool.test.ts` for test patterns
- Reference `skills-factory.ts` for factory patterns

---

**Generated by BMad TEA Agent** - 2026-01-07
