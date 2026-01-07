# Tech-Spec: Test Factory Refactoring - Systematic Test Improvement

**Created:** 2026-01-04
**Status:** Ready for Development
**Author:** TEA (Test Architect) + Sid
**Priority:** P1 (High - Technical Debt Reduction)

---

## Overview

### Problem Statement

The Orion Slack Agent test suite (1,134 tests across 83 files) has accumulated technical debt:

**Critical Issues:**
1. **Over-Mocking (347 instances)** - Module-level `vi.mock()` calls create brittle tests that break when implementation changes
2. **Hardcoded Test Data** - Same test data structures duplicated across hundreds of tests (e.g., `baseOptions` repeated in 42 tests)
3. **Poor Maintainability** - Changing a data structure requires updating hundreds of tests
4. **No BDD Structure** - Only 2/1,134 tests have Given-When-Then comments
5. **Oversized Files** - 7 test files exceed 500 lines (max: 1,678 lines)
6. **Low Readability** - Test intent buried in setup boilerplate

**Impact:**
- Refactoring is expensive (tests break frequently)
- New developers struggle to understand test intent
- Test failures don't clearly indicate real bugs
- Maintenance burden increases over time

### Solution

Implement **data factory pattern** to systematically improve test quality:

1. ✅ **DONE**: Create `tests/factories/agent-factory.ts` with 12 factory functions
2. **THIS SPEC**: Refactor 10 tests as proof-of-concept (establish pattern)
3. **THIS SPEC**: Create `slack-factory.ts` for Slack event data
4. **THIS SPEC**: Split 3 largest test files into focused modules
5. **THIS SPEC**: Add BDD structure to 20 critical tests
6. **FUTURE**: Incremental refactoring during regular development

**Expected Outcomes:**
- 40-60% reduction in test setup code
- Tests focus on behavior, not implementation details
- Easy maintenance (change factory, all tests update)
- Clear test intent (override only what matters)
- Realistic, varied test data catches more edge cases

### Scope (In/Out)

**IN SCOPE:**
- Complete refactoring of 10 tests in `agent/loop.test.ts` (proof-of-concept)
- Create `tests/factories/slack-factory.ts` with 8+ functions
- Split 3 largest test files into focused modules (<300 lines each)
- Add Given-When-Then structure to 20 critical tests
- Document patterns and migration guide
- Update 2-3 tests as examples for each factory

**OUT OF SCOPE:**
- Complete refactoring of all 1,134 tests (incremental over 3 months)
- Removing all mocks (minimize to <175, not eliminate)
- Rewriting test logic (only refactor data setup)
- Performance optimization of test suite
- Adding new test coverage

---

## Context for Development

### Codebase Patterns

#### Current Test Structure (Problematic)

**1. Module-Level Mocks (347 instances)**
```typescript
// Found in almost every test file
vi.mock('../config/environment.js', () => ({
  config: { anthropicApiKey: 'test-api-key', ... }
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock }
  }));
  return { default: MockAnthropic };
});
```

**Problem**: Tests are tightly coupled to implementation. Every refactor breaks dozens of tests.

**2. Hardcoded Test Data (Duplicated 42+ times)**
```typescript
// Repeated in every agent test file
const baseOptions: AgentLoopOptions = {
  context: {
    threadHistory: [],
    userId: 'U123',
    channelId: 'C456',
    traceId: 'trace-abc',
  },
  systemPrompt: 'You are Orion, a helpful assistant.',
};
```

**Problem**: Changing `AgentContext` requires updating 42+ test files.

**3. Local Helper Functions (Duplicated across files)**
```typescript
// Duplicated in multiple files
function createMockMessageStream(params: { events: Array<unknown> }) {
  return {
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        async next() {
          if (index < params.events.length) {
            return { value: params.events[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}
```

**Problem**: Same helpers copy-pasted across files. Changes must be duplicated.

#### Target Test Structure (Factory Pattern)

**1. Use Factories for Test Data**
```typescript
import { createAgentLoopOptions, createMockStreamWithText } from '../../tests/factories';

it('should process message', async () => {
  // Given: Agent with realistic defaults
  const options = createAgentLoopOptions();

  // When: Mock returns simple response
  messagesCreateMock.mockImplementation(async () =>
    createMockStreamWithText('Hello')
  );

  // Then: Process successfully
  const result = await executeAgentLoop('Hi', options);
  expect(result).toContain('Hello');
});
```

**Benefits**:
- 60% less code
- Clear intent (what matters for this test is obvious)
- Easy maintenance (change factory, all tests update)
- BDD structure

**2. Override Only What Matters**
```typescript
// Default values
const context = createAgentContext();

// Override specific field when it matters for the test
const adminContext = createAgentContext({ userId: 'U_ADMIN' });
```

**Benefits**:
- Test intent is clear (override = this matters!)
- Defaults handle the rest
- Realistic data via faker

### Files to Reference

#### Existing Factory Infrastructure ✅

**Primary Factory Module:**
- `tests/factories/agent-factory.ts` - 487 lines, 12 functions
  - `createAgentContext(overrides?)` - Creates realistic AgentContext
  - `createAgentLoopOptions(overrides?)` - Complete agent loop options
  - `createThreadMessage(overrides?)` - Single thread message
  - `createThreadHistory(count)` - Multi-message thread
  - `createMockMessageStream(events)` - Base async iterable stream
  - `createMockStreamWithText(text, opts?)` - Simple text response
  - `createMockStreamWithToolUse(blocks, opts?)` - Stream with tools
  - `createMockStreamWithChunks(chunks, opts?)` - Multi-chunk streaming
  - `createSlackUserId()` - Realistic Slack user ID
  - `createSlackChannelId()` - Realistic channel ID
  - `createSlackTimestamp(date?)` - Timestamp with microseconds
  - `createTestScenario(config)` - One-liner complete setup

**Exports & Documentation:**
- `tests/factories/index.ts` - Clean exports for all factories
- `tests/factories/README.md` - Complete usage guide with examples

**Proof-of-Concept Tests:**
- `src/agent/loop.test.ts:126-170` - 2 refactored tests showing pattern

#### Target Files for Refactoring

**Priority 1 - Agent Tests (This Spec):**
- `src/agent/loop.test.ts` (1,678 lines, 42 tests)
  - Currently: 2/42 tests refactored
  - Target: 10/42 tests refactored (proof-of-concept complete)
  - Focus: Tests lines 131-400 (streaming, tool execution, verification)

**Priority 2 - Create Slack Factory (This Spec):**
- Study these files for Slack data patterns:
  - `src/slack/handlers/app-mention.test.ts` (836 lines)
  - `src/slack/handlers/user-message.test.ts` (1,127 lines)
- Extract common patterns into `slack-factory.ts`

**Priority 3 - Split Large Files (This Spec):**
1. `src/agent/loop.test.ts` (1,678 lines) → 4 files (~400 lines each)
   - `loop.streaming.test.ts` - Streaming and chunking tests
   - `loop.verification.test.ts` - Verification and retry tests
   - `loop.tool-execution.test.ts` - Tool use and execution tests
   - `loop.citations.test.ts` - Source citations tests

2. `src/tools/mcp/client.test.ts` (1,351 lines) → 3 files
   - `client.connection.test.ts` - Connection and session management
   - `client.tools.test.ts` - Tool listing and calling
   - `client.lifecycle.test.ts` - Init handshake and lifecycle

3. `src/slack/handlers/user-message.test.ts` (1,127 lines) → 3 files
   - `user-message.parsing.test.ts` - Message parsing tests
   - `user-message.handler.test.ts` - Handler logic tests
   - `user-message.integration.test.ts` - Integration tests

#### Related Documentation

**Test Quality Standards:**
- `docs/testing-standards.md` - Complete testing guide
- `docs/test-quality-quick-reference.md` - One-page cheat sheet
- `_bmad-output/test-review.md` - Comprehensive test audit
- `_bmad-output/test-quality-remediation-plan.md` - 3-month roadmap
- `_bmad-output/factory-proof-of-concept-complete.md` - Factory PoC results

**Configuration:**
- `vitest.config.ts` - Coverage thresholds (85/78/85/85)
- `.github/workflows/ci.yml` - Coverage enforcement in CI
- `package.json` - @faker-js/faker@10.2.0

### Technical Decisions

#### 1. Factory Design Pattern: Override Pattern

**Decision:** Use defaults + selective overrides
```typescript
export function createAgentContext(overrides = {}): AgentContext {
  return {
    threadHistory: [],
    userId: createSlackUserId(),  // Realistic random ID
    channelId: createSlackChannelId(),
    traceId: faker.string.uuid(),
    ...overrides,  // Override specific fields
  };
}
```

**Rationale:**
- Defaults make tests concise
- Overrides make test intent clear
- Realistic random data catches edge cases
- Type-safe with TypeScript

**Alternative Considered:** Builder pattern (rejected - too verbose)

#### 2. Data Generation: @faker-js/faker

**Decision:** Use faker for all test data generation
```typescript
userId: faker.string.alphanumeric({ length: 9, casing: 'upper' })
```

**Rationale:**
- Generates realistic, varied data automatically
- Catches bugs that only appear with certain patterns
- Industry standard (15M+ downloads/week)
- Better than hardcoded 'U123' repeated everywhere

**Alternative Considered:** Hardcoded defaults (rejected - not realistic)

#### 3. Factory Organization: Co-located, Not Per-Module

**Decision:** `tests/factories/` with domain-focused modules
- `agent-factory.ts` - Agent loop, context, mock streams
- `slack-factory.ts` - Slack events, clients, messages
- Future: `tool-factory.ts`, `memory-factory.ts`, etc.

**Rationale:**
- Easier to find (one place, not scattered)
- Shared across all tests
- Clear ownership and documentation
- Follows testing standards best practices

**Alternative Considered:** Per-module factories (rejected - too scattered)

#### 4. Migration Strategy: Incremental, Not Big Bang

**Decision:** Refactor incrementally during regular work
- This spec: 10 tests proof-of-concept
- Future: Touch a file → refactor its tests
- Goal: 80% adoption in 3 months

**Rationale:**
- Low risk (tests keep passing)
- Sustainable (no dedicated refactor sprint)
- Team learns pattern gradually
- Immediate benefit for new tests

**Alternative Considered:** Refactor all 1,134 tests now (rejected - too risky)

#### 5. BDD Structure: Given-When-Then Comments

**Decision:** Add GWT comments to all refactored tests
```typescript
it('should process message', async () => {
  // Given: Setup preconditions
  const options = createAgentLoopOptions();

  // When: Execute behavior
  messagesCreateMock.mockImplementation(async () =>
    createMockStreamWithText('Hello')
  );
  const result = await executeAgentLoop('Hi', options);

  // Then: Assert expected outcome
  expect(result).toContain('Hello');
});
```

**Rationale:**
- Self-documenting test behavior
- Clear test phases
- Easier debugging when tests fail
- Industry best practice

**Alternative Considered:** No comments (rejected - hurts readability)

---

## Implementation Plan

### Tasks

#### Phase 1: Complete Proof-of-Concept (10 Tests) ⏱️ 2-3 hours

- [ ] **Task 1.1**: Refactor 8 more tests in `agent/loop.test.ts` (currently 2/10 done)
  - Target tests (lines 193-600):
    - "should execute tool_use via callback" (~line 193)
    - "should handle concurrent tool execution" (~line 250)
    - "should track tool count and metrics" (~line 320)
    - "should handle verification failure and retry" (~line 380)
    - "should use graceful fallback after max retries" (~line 450)
    - "should stream tool use blocks" (~line 520)
    - "should validate tool input size limits" (~line 580)
    - "should handle tool execution errors" (~line 640)
  - Replace `baseOptions` with `createAgentLoopOptions()`
  - Replace manual mock streams with `createMockStreamWithText/ToolUse()`
  - Add Given-When-Then comments
  - Verify all tests still pass

- [ ] **Task 1.2**: Document patterns learned from 10-test refactoring
  - Update `tests/factories/README.md` with real-world examples
  - Note any factory functions that need enhancement
  - Create migration guide section with before/after comparisons

#### Phase 2: Create Slack Factory ⏱️ 3-4 hours

- [ ] **Task 2.1**: Analyze Slack test data patterns
  - Read `src/slack/handlers/app-mention.test.ts` (lines 1-200)
  - Read `src/slack/handlers/user-message.test.ts` (lines 1-200)
  - Identify common data structures:
    - App mention events
    - User message events
    - Slack client mocks
    - Say function mocks
    - Reaction mocks
  - Document patterns found

- [ ] **Task 2.2**: Create `tests/factories/slack-factory.ts`
  - Implement these functions (minimum):
    - `createAppMentionEvent(overrides?)` - App mention event with full structure
    - `createUserMessageEvent(overrides?)` - User message event
    - `createSlackClient(overrides?)` - Mock Slack client with reactions/chat methods
    - `createSlackSay(overrides?)` - Mock say function
    - `createSlackMessage(overrides?)` - Generic Slack message
    - `createSlackThread(messageCount)` - Thread with multiple messages
    - `createSlackReaction(overrides?)` - Reaction object
    - `createSlackContext(overrides?)` - Bolt context object
  - Use faker for realistic IDs and timestamps
  - Follow override pattern from agent-factory
  - Add JSDoc comments for all functions

- [ ] **Task 2.3**: Update exports and documentation
  - Add slack-factory exports to `tests/factories/index.ts`
  - Add slack-factory section to `tests/factories/README.md` with examples
  - Create 2-3 example test refactors showing slack-factory usage

- [ ] **Task 2.4**: Refactor 3 Slack tests as proof-of-concept
  - Pick 3 tests from `app-mention.test.ts`
  - Refactor using new slack-factory
  - Verify tests still pass
  - Document any improvements needed

#### Phase 3: Split Oversized Test Files ⏱️ 3-4 hours

- [ ] **Task 3.1**: Split `agent/loop.test.ts` (1,678 lines → 4 files)
  - Create directory: `src/agent/loop/`
  - Create `loop.streaming.test.ts` (~400 lines)
    - Move streaming and chunking tests
    - Import factories at top
    - Keep beforeEach/afterEach
  - Create `loop.verification.test.ts` (~400 lines)
    - Move verification and retry logic tests
  - Create `loop.tool-execution.test.ts` (~450 lines)
    - Move tool use and execution tests
  - Create `loop.citations.test.ts` (~350 lines)
    - Move source citations tests
  - Delete original `loop.test.ts`
  - Run all tests to verify no breakage
  - Update imports in any files that imported from loop.test.ts

- [ ] **Task 3.2**: Split `tools/mcp/client.test.ts` (1,351 lines → 3 files)
  - Create directory: `src/tools/mcp/`
  - Create `client.connection.test.ts` (~450 lines)
    - Connection, session management, lifecycle
  - Create `client.tools.test.ts` (~450 lines)
    - Tool listing, calling, tool results
  - Create `client.lifecycle.test.ts` (~450 lines)
    - Init handshake, stateless detection, session recovery
  - Delete original `client.test.ts`
  - Run tests to verify

- [ ] **Task 3.3**: Split `slack/handlers/user-message.test.ts` (1,127 lines → 3 files)
  - Create directory: `src/slack/handlers/user-message/`
  - Create `user-message.parsing.test.ts` (~350 lines)
    - Message text extraction, mention parsing
  - Create `user-message.handler.test.ts` (~400 lines)
    - Handler logic, agent integration
  - Create `user-message.integration.test.ts` (~377 lines)
    - End-to-end integration tests
  - Delete original `user-message.test.ts`
  - Run tests to verify

#### Phase 4: Add BDD Structure to Critical Tests ⏱️ 2 hours

- [ ] **Task 4.1**: Identify 20 critical tests (P0 functionality)
  - Agent loop core functionality (5 tests)
  - Message handling (5 tests)
  - Tool execution (5 tests)
  - Memory operations (5 tests)
  - Document test names and file locations

- [ ] **Task 4.2**: Add Given-When-Then comments to 20 tests
  - Add comments following the pattern:
    ```typescript
    // Given: Describe preconditions
    // When: Describe action
    // Then: Describe expected outcome
    ```
  - Keep comments concise (1 line each)
  - Don't change test logic, only add comments
  - Verify tests still pass

#### Phase 5: Final Documentation and Cleanup ⏱️ 1 hour

- [ ] **Task 5.1**: Update testing standards
  - Add factory examples to `docs/testing-standards.md`
  - Update quick reference with factory usage
  - Add migration guide for teams

- [ ] **Task 5.2**: Create summary metrics report
  - Tests refactored: 16 total (10 agent + 3 slack + 3 examples)
  - Files split: 3 (loop.test, client.test, user-message.test)
  - BDD structure added: 20 tests
  - Factory functions created: ~20 (12 agent + 8 slack)
  - Lines of test code reduced: estimate ~500 lines
  - Factories adoption: 16/1134 = 1.4% (proof-of-concept complete)

- [ ] **Task 5.3**: Document next steps
  - Create issue for incremental refactoring (touch a file → refactor its tests)
  - Set 3-month target: 80% factory adoption
  - Weekly metrics tracking plan

### Acceptance Criteria

#### AC1: Factory Proof-of-Concept Complete
- [x] Given agent-factory.ts exists with 12 functions
- [ ] When 10 tests in loop.test.ts are refactored
- [ ] Then all 10 tests pass and use factories exclusively
- [ ] And tests have 40-60% less setup code
- [ ] And tests have Given-When-Then structure

#### AC2: Slack Factory Created and Working
- [ ] Given slack-factory.ts doesn't exist
- [ ] When slack-factory.ts is created with 8+ functions
- [ ] Then 3 Slack tests are successfully refactored using it
- [ ] And all refactored tests pass
- [ ] And slack-factory is documented in README

#### AC3: Large Test Files Split
- [ ] Given 3 test files exceed 1,000 lines
- [ ] When test files are split by concern
- [ ] Then all resulting files are <500 lines
- [ ] And all tests still pass in new locations
- [ ] And imports are updated correctly

#### AC4: BDD Structure Added
- [ ] Given 20 critical tests are identified
- [ ] When Given-When-Then comments are added
- [ ] Then all 20 tests have clear GWT structure
- [ ] And test intent is immediately clear
- [ ] And tests still pass

#### AC5: Documentation Complete
- [ ] Given factory usage may be unclear to team
- [ ] When documentation is updated
- [ ] Then README has complete usage guide with examples
- [ ] And testing-standards.md includes factory pattern
- [ ] And migration guide exists for gradual adoption

---

## Additional Context

### Dependencies

**Already Installed:**
- ✅ `@faker-js/faker@10.2.0` - Test data generation
- ✅ `vitest@1.6.1` - Test framework
- ✅ `typescript@5.7.2` - Type checking

**No New Dependencies Required**

### Testing Strategy

**Unit Tests:**
- All refactored tests remain unit tests
- Factory functions are pure (no external dependencies)
- Tests still fast (<4 seconds total runtime)

**Integration Tests:**
- No changes to integration test strategy
- Factories work for both unit and integration tests

**Coverage:**
- Maintain current coverage: 86.52% statements
- CI enforces thresholds: 85/78/85/85
- Factory refactoring should not change coverage

**Test Execution:**
```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/agent/loop/loop.streaming.test.ts

# Run with coverage
pnpm test:coverage

# Check factory usage adoption
grep -r "createAgentLoopOptions\|createSlackEvent" src/**/*.test.ts | wc -l
```

### Notes

**Success Metrics (After This Spec):**
- ✅ Factory infrastructure complete (agent + slack)
- ✅ 16 tests refactored (1.4% of 1,134)
- ✅ 3 large files split into manageable modules
- ✅ 20 tests have BDD structure
- ✅ Pattern established for team adoption
- ✅ Documentation complete

**Next Phase (Incremental, 3 Months):**
- Touch a file during regular work → refactor its tests
- New features → use factories from day 1
- Track weekly: `grep -r "create.*Factory" src/**/*.test.ts | wc -l`
- Target: 80% adoption (900+ tests) by end of Q1 2026

**Risk Mitigation:**
1. **Risk**: Team pushback on extra work
   - **Mitigation**: Show before/after examples (40% less code!)
   - **Mitigation**: No forced refactoring, just new tests + touched files

2. **Risk**: Factories feel like overhead
   - **Mitigation**: Create REALLY good factories with great docs
   - **Mitigation**: Pair with developers to show benefits

3. **Risk**: Breaking tests during refactoring
   - **Mitigation**: Refactor one test at a time
   - **Mitigation**: Run tests after each refactor
   - **Mitigation**: Keep old helpers until all tests migrated

**Key Insights from Proof-of-Concept:**
- ✅ 40-60% code reduction per test is achievable
- ✅ Tests become more readable with overrides
- ✅ Faker generates realistic varied data
- ✅ BDD structure improves clarity
- ⚠️ Import paths from `src/` to `tests/` need careful attention
- ⚠️ Name conflicts when removing local helpers - audit carefully

**Resources:**
- TEA agent (`bmad tea`) for test quality review
- testarch-test-review workflow for ongoing quality checks
- Weekly metrics dashboard (see test-quality-remediation-plan.md)

---

## Implementation Order

**Recommended sequence** (minimize risk, maximize learning):

1. **Week 1: Phase 1 + Phase 2** (5-7 hours)
   - Complete 10-test proof-of-concept (establish confidence)
   - Create slack-factory (second most common data)
   - **Deliverable**: 16 tests refactored, 2 complete factories

2. **Week 1-2: Phase 3** (3-4 hours)
   - Split large files (improve maintainability)
   - Can be done in parallel with Phase 2
   - **Deliverable**: All test files <500 lines

3. **Week 2: Phase 4** (2 hours)
   - Add BDD to critical tests (quick wins)
   - Can be done while split files are being tested
   - **Deliverable**: 20 tests with clear structure

4. **Week 2: Phase 5** (1 hour)
   - Documentation and wrap-up
   - **Deliverable**: Complete migration guide

**Total Estimated Time:** 11-14 hours over 1-2 weeks

**After This Spec:**
- Pattern established and proven
- Team can adopt incrementally
- No dedicated time needed (refactor during regular work)
- Track progress weekly, celebrate wins monthly

---

**END OF TECH-SPEC**
