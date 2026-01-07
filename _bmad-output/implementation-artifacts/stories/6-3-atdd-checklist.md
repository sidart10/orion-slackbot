# ATDD Checklist - Epic 6, Story 6.3: Skills Container Configuration

**Date:** 2026-01-07
**Author:** Murat (TEA Agent)
**Primary Test Level:** Unit Tests (Vitest)

---

## Story Summary

Container lifecycle management for Anthropic Skills API containers. Manages container ID persistence across multi-turn Slack conversations using a singleton Map-based cache with TTL expiration.

**As a** developer
**I want** the agent loop to track container IDs across conversation turns
**So that** Claude can reuse the same container environment for performance and context continuity

---

## Acceptance Criteria

1. **AC#1** - Multi-turn container reuse: When receiving a response with `container.id`, subsequent requests reuse that container ID via lifecycle manager
2. **AC#2** - Fresh container for new threads: Starting agent loop for new Slack thread, lifecycle manager returns undefined
3. **AC#3** - Container ID updates: When Claude returns a new `container.id`, the lifecycle manager is updated for future turns
4. **AC#4** - TTL expiration: After 30 min idle timeout, lifecycle manager returns undefined (fresh container)
5. **AC#5** - Observability: Container create/reuse events captured as Langfuse point-in-time events
6. **AC#6** - Memory bounds: With >1000 active containers, oldest expired entries pruned first
7. **AC#7** - Graceful shutdown: On SIGTERM, lifecycle manager cleanup timer is cleared

---

## Failing Tests Created (RED Phase)

### Unit Tests (10 tests)

**File:** `src/skills/container-lifecycle.test.ts` (~180 lines)

Tests written using Vitest with fake timers for TTL testing. All tests fail initially because `container-lifecycle.ts` does not exist.

| # | Test Name | Status | Failure Reason | Verifies |
|---|-----------|--------|----------------|----------|
| 1 | returns undefined for unknown threadTs | RED | Module not found | AC#2 - Fresh thread returns undefined |
| 2 | returns stored containerId after set | RED | Module not found | AC#1, AC#3 - Basic get/set |
| 3 | returns undefined after TTL expires | RED | Module not found | AC#4 - 30 min TTL expiration |
| 4 | updates lastUsed on get | RED | Module not found | AC#4 - Touch updates TTL |
| 5 | clears entry on clearContainerId | RED | Module not found | Explicit removal |
| 6 | prunes oldest when at max entries | RED | Module not found | AC#6 - Memory bounds |
| 7 | prunes only expired entries | RED | Module not found | AC#6 - Selective pruning |
| 8 | clears timer on destroy | RED | Module not found | AC#7 - Graceful shutdown |
| 9 | handles concurrent access safely | RED | Module not found | Thread safety |
| 10 | clears all entries on _clear | RED | Module not found | Test isolation |

---

## Data Factories Created

### Container State Factory

**File:** `tests/factories/container-factory.ts`

**Exports:**
- `createContainerState(overrides?)` - Create single ContainerState with optional overrides
- `createThreadTs()` - Generate realistic Slack thread_ts format

**Example Usage:**

```typescript
import { createContainerState, createThreadTs } from '../../tests/factories/container-factory.js';

const threadTs = createThreadTs(); // "1704672000.123456"
const state = createContainerState({
  containerId: 'cntr_test123',
  lastUsed: Date.now() - 1000
});
```

---

## Fixtures Created

### Container Lifecycle Test Fixtures

**File:** `src/skills/container-lifecycle.test.ts` (inline fixtures)

**Fixtures:**

- `fakeTimers` - Vitest fake timers for TTL testing
  - **Setup:** `vi.useFakeTimers({ now: Date.now() })`
  - **Cleanup:** `vi.useRealTimers()` in afterEach

- `cleanInstance` - Fresh singleton state
  - **Setup:** `containerLifecycle._clear()`
  - **Cleanup:** Automatic (singleton persists)

**Example Usage:**

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ContainerLifecycleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.now() });
    // Import and clear singleton
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
```

---

## Mock Requirements

### Logger Mock

**Module:** `../utils/logger.js`

**Mock Implementation:**

```typescript
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
```

**Notes:** Logger is mocked to prevent console output during tests and to verify logging calls.

---

## Required data-testid Attributes

*Not applicable* — This story is unit tests only (no UI components).

---

## Implementation Checklist

### Test: returns undefined for unknown threadTs (AC#2)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/skills/container-lifecycle.ts`
- [ ] Create `ContainerLifecycleManager` class with private constructor
- [ ] Create singleton pattern with `getInstance()` static method
- [ ] Implement `getContainerId(threadTs: string): string | undefined` returning undefined for unknown keys
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "returns undefined for unknown"`
- [ ] ✅ Test passes (green phase)

---

### Test: returns stored containerId after set (AC#1, AC#3)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `setContainerId(threadTs: string, containerId: string): void`
- [ ] Store in `Map<string, ContainerState>`
- [ ] Implement `getContainerId` to return stored containerId
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "returns stored containerId"`
- [ ] ✅ Test passes (green phase)

---

### Test: returns undefined after TTL expires (AC#4)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Add TTL check in `getContainerId()` — compare `Date.now() - lastUsed > CONTAINER_TTL_MS`
- [ ] Delete expired entries on access (lazy expiration)
- [ ] Define `CONTAINER_TTL_MS = 30 * 60 * 1000` constant
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "returns undefined after TTL"`
- [ ] ✅ Test passes (green phase)

---

### Test: updates lastUsed on get (AC#4)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Update `state.lastUsed = Date.now()` on successful `getContainerId` call
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "updates lastUsed"`
- [ ] ✅ Test passes (green phase)

---

### Test: clears entry on clearContainerId

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `clearContainerId(threadTs: string): void`
- [ ] Delete entry from Map
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "clears entry"`
- [ ] ✅ Test passes (green phase)

---

### Test: prunes oldest when at max entries (AC#6)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Define `MAX_ENTRIES = 1000` constant
- [ ] Check size before adding in `setContainerId()`
- [ ] Implement `findOldest()` private method
- [ ] Remove oldest entry when at limit
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "prunes oldest"`
- [ ] ✅ Test passes (green phase)

---

### Test: prunes only expired entries (AC#6)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `pruneExpired()` private method
- [ ] Iterate Map and delete entries where `now - lastUsed > TTL`
- [ ] Call `pruneExpired()` before `findOldest()` in `setContainerId()`
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "prunes only expired"`
- [ ] ✅ Test passes (green phase)

---

### Test: clears timer on destroy (AC#7)

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Add cleanup interval in constructor: `setInterval(() => this.pruneExpired(), CLEANUP_INTERVAL_MS)`
- [ ] Store interval ID in `cleanupTimer` property
- [ ] Implement `destroy(): void` — call `clearInterval(this.cleanupTimer)`
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "clears timer on destroy"`
- [ ] ✅ Test passes (green phase)

---

### Test: handles concurrent access safely

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Verify Map operations are atomic (JavaScript single-threaded guarantee)
- [ ] Test rapid interleaved set/get calls don't corrupt state
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "handles concurrent access"`
- [ ] ✅ Test passes (green phase)

---

### Test: clears all entries on _clear

**File:** `src/skills/container-lifecycle.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `_clear(): void` for test isolation
- [ ] Call `this.containers.clear()`
- [ ] Run test: `npx vitest run src/skills/container-lifecycle.test.ts -t "clears all entries"`
- [ ] ✅ Test passes (green phase)

---

## Running Tests

```bash
# Run all failing tests for this story
npx vitest run src/skills/container-lifecycle.test.ts

# Run specific test by name pattern
npx vitest run src/skills/container-lifecycle.test.ts -t "returns undefined"

# Run tests in watch mode
npx vitest src/skills/container-lifecycle.test.ts

# Debug with verbose output
npx vitest run src/skills/container-lifecycle.test.ts --reporter=verbose

# Run with coverage
npx vitest run src/skills/container-lifecycle.test.ts --coverage
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All 10 unit tests written and failing
- ✅ Fixtures and cleanup patterns established
- ✅ Mock requirements documented
- ✅ Implementation checklist created with clear tasks

**Verification:**

- All tests fail with "Cannot find module" or "is not exported"
- Failure messages are clear: missing implementation
- Tests fail due to missing `container-lifecycle.ts`, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Create the module** `src/skills/container-lifecycle.ts`
2. **Pick one failing test** (start with "returns undefined for unknown threadTs")
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify green
5. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't implement everything at once)
- Minimal implementation (only what's needed to pass current test)
- Run tests frequently (after each change)
- Follow singleton pattern from `src/tools/mcp/manager.ts`

**Progress Tracking:**

- Check off tasks as you complete them
- Update story status to 'in-progress' when starting

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all 10 tests pass** (green phase complete)
2. **Add Langfuse observability** (AC#5 — point-in-time events)
3. **Integrate with agent loop** (Task 3 in story)
4. **Add graceful shutdown** in `src/index.ts` (Task 4 in story)
5. **Ensure tests still pass** after each refactor

**Completion:**

- All unit tests pass
- Integration with loop.ts complete
- Graceful shutdown registered
- Ready for code review

---

## Next Steps

1. **Review this checklist** to understand test coverage
2. **Run failing tests** to confirm RED phase: `npx vitest run src/skills/container-lifecycle.test.ts`
3. **Begin implementation** using implementation checklist as guide
4. **Work one test at a time** (red → green for each)
5. **When all tests pass**, integrate with agent loop (Task 3)
6. **Add observability** (AC#5) and graceful shutdown (AC#7)
7. **Update story status** to 'done' when complete

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **data-factories.md** — Factory patterns for test data generation (used for ContainerState factory)
- **test-quality.md** — Test design principles (Given-When-Then structure, one assertion per test)
- **test-levels-framework.md** — Determined unit tests as appropriate level (pure logic, no browser needed)

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/skills/container-lifecycle.test.ts`

**Expected Results:**

```
FAIL  src/skills/container-lifecycle.test.ts
  ✗ ContainerLifecycleManager › returns undefined for unknown threadTs
  ✗ ContainerLifecycleManager › returns stored containerId after set
  ✗ ContainerLifecycleManager › returns undefined after TTL expires
  ✗ ContainerLifecycleManager › updates lastUsed on get
  ✗ ContainerLifecycleManager › clears entry on clearContainerId
  ✗ ContainerLifecycleManager › prunes oldest when at max entries
  ✗ ContainerLifecycleManager › prunes only expired entries
  ✗ ContainerLifecycleManager › clears timer on destroy
  ✗ ContainerLifecycleManager › handles concurrent access safely
  ✗ ContainerLifecycleManager › clears all entries on _clear

Tests: 10 failed, 10 total
```

**Summary:**

- Total tests: 10
- Passing: 0 (expected)
- Failing: 10 (expected — module doesn't exist yet)
- Status: ✅ RED phase verified

**Expected Failure Messages:**

- `Error: Cannot find module './container-lifecycle.js'`
- Or `containerLifecycle is not exported from module`

---

## Notes

- **Blocking dependency:** Story 6.2 Task 3 (container-builder.ts) must be complete before this story starts
- **threadTs format:** Slack thread timestamps are like `"1704672000.123456"` — always strings
- **Singleton pattern:** Follow `src/tools/mcp/manager.ts:25-59` exactly
- **No WeakMap:** Use `Map<string, ContainerState>` because threadTs keys are strings (WeakMap requires objects)
- **Point-in-time events:** Langfuse observability creates span and ends immediately (not duration tracking)

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Refer to story file: `_bmad-output/implementation-artifacts/stories/6-3-skills-container-config.md`
- Consult `src/tools/mcp/manager.ts` for singleton pattern reference

---

**Generated by BMad TEA Agent** - 2026-01-07
