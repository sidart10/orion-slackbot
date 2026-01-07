# Testing Standards - Orion Slack Agent

**Last Updated**: 2026-01-04
**Owner**: Engineering Team
**Status**: Active

---

## Purpose

This document defines the testing standards for the Orion Slack Agent project. Following these standards ensures:
- Tests are maintainable and resilient to refactoring
- New features have high-quality test coverage
- Team has consistent expectations
- Technical debt is minimized

---

## Core Principles

### 1. **Tests First** (Test-Driven Development)

**Rule**: Write tests BEFORE implementation whenever possible.

**Why**: Tests written first naturally lead to better design, clearer requirements, and more testable code.

**Process**:
```typescript
// 1. Write failing test that describes behavior
it('should create thread summary when user requests /summarize', async () => {
  // Given: A thread with messages
  const thread = createThreadWithMessages(5);

  // When: User requests summarize
  const result = await handleSummarizeCommand(thread);

  // Then: Summary is created
  expect(result.summary).toBeDefined();
  expect(result.summary).toContain('key points');
});

// 2. Run test - it fails ❌
// 3. Implement minimal code to make it pass
// 4. Run test - it passes ✅
// 5. Refactor if needed, tests keep passing
```

**For new features**: Use `bmad tea → testarch-atdd` workflow to guide this process.

---

### 2. **Minimize Mocking** (Test Real Behavior)

**Rule**: Mock at system boundaries only. Avoid mocking internal modules.

**❌ Bad** (Over-mocking):
```typescript
// Testing mocks, not real code
vi.mock('../database');
vi.mock('../config');
vi.mock('../logger');
vi.mock('../formatter');
vi.mock('../validator');

// This test only proves mocks work!
```

**✅ Good** (Minimal mocking):
```typescript
// Mock only external dependencies
import { createTestDatabase } from '../../test-utils/database';

describe('User Service', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase(); // Real in-memory database
  });

  it('should create user', async () => {
    const user = await userService.create({ name: 'Test' });
    expect(user.id).toBeDefined();

    // Verify with real database query
    const saved = await db.users.findById(user.id);
    expect(saved.name).toBe('Test');
  });
});
```

**What to mock**:
- ✅ External HTTP APIs (Slack, Anthropic)
- ✅ File system operations
- ✅ Time/dates (when testing time-dependent logic)
- ✅ Random generators (when testing randomness)

**What NOT to mock**:
- ❌ Internal business logic
- ❌ Utility functions
- ❌ Type definitions
- ❌ Config modules (use test config instead)
- ❌ Logger (use silent logger in tests)

---

### 3. **Use Data Factories** (DRY Test Data)

**Rule**: Never hardcode test data. Use factory functions with overrides.

**❌ Bad** (Hardcoded):
```typescript
// Duplicated across 50 tests!
it('should handle app mention', async () => {
  const event = {
    type: 'app_mention',
    channel: 'C123456',
    user: 'U123456',
    text: '<@U0928FBEH9C> hello',
    ts: '1234567890.123456',
    thread_ts: undefined,
  };
  // Test uses event...
});
```

**✅ Good** (Factory):
```typescript
import { createAppMentionEvent } from '../../tests/factories';

it('should handle app mention', async () => {
  // Concise, realistic, flexible
  const event = createAppMentionEvent({
    text: '<@UBOT> hello',
  });
  // Test uses event...
});

it('should handle threaded app mention', async () => {
  // Override only what matters for this test
  const event = createAppMentionEvent({
    text: '<@UBOT> reply',
    thread_ts: '1234567880.000000',
  });
  // Test uses event...
});
```

**Factory location**: `tests/factories/`

**Available factories**:
- `agent-factory.ts` - Agent loop options, context, etc.
- `slack-factory.ts` - Slack events, messages, clients
- *(More to be added)*

**Creating a new factory**:
```typescript
import { faker } from '@faker-js/faker';

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    createdAt: faker.date.recent(),
    ...overrides, // Allow test to override specific fields
  };
}

// Usage - generates realistic random data
const user = createUser(); // id: "abc-123", name: "John Smith", ...

// Usage - override specific fields when needed
const admin = createUser({ email: 'admin@example.com', role: 'admin' });
```

---

### 4. **BDD Structure** (Given-When-Then)

**Rule**: Every test must have clear Given-When-Then structure.

**Format**:
```typescript
it('should <expected behavior> when <condition>', async () => {
  // Given: Setup and preconditions
  const user = createUser();
  const thread = createThread({ author: user.id });

  // When: Execute the behavior being tested
  const result = await summarizeThread(thread);

  // Then: Assert expected outcome
  expect(result.summary).toBeDefined();
  expect(result.author).toBe(user.id);
});
```

**Benefits**:
- Self-documenting behavior
- Clear test phases
- Easier debugging when tests fail
- Better test design

---

### 5. **Test Isolation** (No Shared State)

**Rule**: Tests must be independent and not share state.

**❌ Bad** (Shared state):
```typescript
// Module-level mock shared across all tests!
vi.mock('../database');
const mockDb = getMockDb();

describe('User tests', () => {
  it('test 1', () => {
    mockDb.users = [{ id: 1 }]; // Modifies shared state!
  });

  it('test 2', () => {
    // Sees mockDb.users from test 1! Flaky!
    expect(mockDb.users).toHaveLength(0); // Fails!
  });
});
```

**✅ Good** (Isolated):
```typescript
describe('User tests', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    // Fresh database for each test
    db = await createTestDatabase();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.close();
  });

  it('test 1', async () => {
    await db.users.create({ id: 1 });
    // Only affects this test's db
  });

  it('test 2', async () => {
    // Fresh db, no users from test 1
    const users = await db.users.findAll();
    expect(users).toHaveLength(0); // Passes!
  });
});
```

**Checklist**:
- ✅ Use `beforeEach` to set up fresh state
- ✅ Use `afterEach` to clean up
- ✅ Avoid module-level variables
- ✅ Tests pass when run in any order
- ✅ Tests pass when run in isolation

---

### 6. **No Hard Waits** (Deterministic Tests)

**Rule**: Never use `setTimeout`, `sleep`, or arbitrary delays.

**❌ Bad**:
```typescript
it('should process message', async () => {
  sendMessage('hello');
  await sleep(1000); // Flaky! What if it takes 1001ms?
  expect(messageProcessed).toBe(true);
});
```

**✅ Good**:
```typescript
it('should process message', async () => {
  const promise = processMessage('hello');
  await promise; // Wait for actual completion
  expect(messageProcessed).toBe(true);
});

// Or use Vitest waitFor utilities
it('should eventually process message', async () => {
  sendMessage('hello');
  await vi.waitUntil(() => messageProcessed, { timeout: 5000 });
  expect(messageProcessed).toBe(true);
});
```

---

### 7. **Test File Size** (Keep Tests Focused)

**Rule**: Test files should be ≤300 lines. Max 500 lines.

**Why**: Large test files are hard to navigate, understand, and maintain.

**When file exceeds 300 lines**:
1. Split by feature/concern
2. Create subdirectory structure
3. Use shared test utilities

**Example structure**:
```
agent/
  └── loop/
      ├── loop.streaming.test.ts      # <300 lines
      ├── loop.verification.test.ts   # <300 lines
      ├── loop.tool-execution.test.ts # <300 lines
      └── loop.citations.test.ts      # <300 lines
```

---

### 8. **Explicit Assertions** (Test One Thing)

**Rule**: Every test must have clear, explicit assertions.

**❌ Bad**:
```typescript
it('should handle user input', async () => {
  const result = await handleInput('test');
  expect(result).toBeTruthy(); // Too vague!
});
```

**✅ Good**:
```typescript
it('should return validated user input', async () => {
  const result = await handleInput('test');

  // Explicit about what we're testing
  expect(result.value).toBe('test');
  expect(result.isValid).toBe(true);
  expect(result.errors).toHaveLength(0);
});
```

---

## Coverage Requirements

**Minimum coverage thresholds** (enforced by CI):
- Statements: ≥85%
- Branches: ≥78%
- Functions: ≥85%
- Lines: ≥85%

**Coverage is automatic** - just run `pnpm test:coverage`.

**When coverage drops below threshold**:
1. CI will fail
2. Add tests for uncovered code
3. Or justify exclusion with comment

**How to exclude lines from coverage**:
```typescript
// Only use for genuinely untestable code
/* istanbul ignore next */
if (process.env.NODE_ENV === 'production') {
  // Production-only logging
}
```

---

## Test Priorities

**Use test tags to classify priority**:

```typescript
// P0 - Critical (smoke tests)
it('should authenticate user', { tags: ['P0', 'smoke', 'auth'] }, async () => {
  // Critical business functionality
});

// P1 - High (core features)
it('should format message', { tags: ['P1', 'formatting'] }, async () => {
  // Important feature
});

// P2 - Medium (edge cases)
it('should handle empty input gracefully', { tags: ['P2', 'edge-case'] }, async () => {
  // Edge case handling
});

// P3 - Low (nice-to-have)
it('should log debug information', { tags: ['P3', 'logging'] }, async () => {
  // Non-critical functionality
});
```

**Run specific priorities**:
```bash
# Smoke tests only (fast)
pnpm test --grep="@P0"

# Critical + High priority
pnpm test --grep="@P0|@P1"
```

---

## Test Review Checklist

**Before submitting PR**, verify tests meet these standards:

### Structure
- [ ] Tests use Given-When-Then structure
- [ ] Test file is ≤300 lines (or <500 with justification)
- [ ] Tests are organized by feature/concern
- [ ] Test names describe behavior, not implementation

### Quality
- [ ] Data factories used (not hardcoded data)
- [ ] Minimal mocking (only boundaries)
- [ ] No module-level mocks
- [ ] Proper isolation (beforeEach/afterEach)
- [ ] No hard waits (no setTimeout/sleep)
- [ ] Explicit assertions
- [ ] Tests are deterministic (no flakiness)

### Coverage
- [ ] All new code is tested
- [ ] Coverage thresholds met (≥85/78/85/85)
- [ ] Edge cases covered
- [ ] Error paths tested

### Process
- [ ] Tests written BEFORE implementation (when possible)
- [ ] testarch-atdd used for new features
- [ ] testarch-test-review run before submitting PR
- [ ] All tests passing locally
- [ ] CI passing (tests + coverage)

---

## BMM Testarch Integration

**When to use testarch workflows**:

### For New Features
```bash
# 1. After story is ready-for-dev
bmad tea

# 2. Select: testarch-test-design (if complex)
# Creates test strategy for the feature

# 3. Select: testarch-atdd
# Writes acceptance tests FIRST

# 4. Implement feature to make tests pass

# 5. Select: testarch-test-review
# Reviews test quality before PR
```

### For Existing Code
```bash
# When refactoring or improving tests
bmad tea

# Select: testarch-test-review
# Identifies test quality issues

# Or for expanding test coverage
# Select: testarch-automate
# Generates additional test cases
```

### Before Release
```bash
# Quality gate before production deploy
bmad tea

# Select: testarch-trace
# Verify requirements → test mapping
```

---

## Common Patterns

### Testing Async Operations
```typescript
it('should handle async operation', async () => {
  // Given
  const promise = longRunningOperation();

  // When - await the promise
  const result = await promise;

  // Then
  expect(result).toBeDefined();
});
```

### Testing Error Handling
```typescript
it('should throw error for invalid input', async () => {
  // Given
  const invalidInput = createInvalidInput();

  // When/Then - use expect().rejects
  await expect(processInput(invalidInput))
    .rejects
    .toThrow('Invalid input');
});
```

### Testing Event Emitters
```typescript
it('should emit event on completion', async () => {
  // Given
  const emitter = createEmitter();
  const eventSpy = vi.fn();
  emitter.on('complete', eventSpy);

  // When
  await emitter.process();

  // Then
  expect(eventSpy).toHaveBeenCalledWith({ status: 'completed' });
});
```

### Testing Generators (Agent Loop)
```typescript
it('should yield chunks from agent', async () => {
  // Given
  const options = createAgentLoopOptions();

  // When - collect all yielded values
  const chunks: string[] = [];
  const gen = executeAgentLoop('Hi', options);
  for await (const chunk of gen) {
    chunks.push(chunk);
  }

  // Then
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.join('')).toContain('Hello');
});
```

---

## Anti-Patterns (Don't Do This!)

### ❌ Testing Implementation Details
```typescript
// Bad - tests internal variable names
expect(component.internalState.counter).toBe(5);

// Good - tests behavior
expect(component.getCount()).toBe(5);
```

### ❌ Multiple Unrelated Assertions
```typescript
// Bad - tests too many things
it('should work', () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
  expect(c).toBe(3); // Which failed?
});

// Good - separate tests
it('should set a to 1', () => expect(a).toBe(1));
it('should set b to 2', () => expect(b).toBe(2));
it('should set c to 3', () => expect(c).toBe(3));
```

### ❌ Conditional Test Logic
```typescript
// Bad - test has branches
it('should handle input', () => {
  if (input.isValid) {
    expect(result).toBe('valid');
  } else {
    expect(result).toBe('invalid');
  }
});

// Good - separate tests for each case
it('should return valid for valid input', () => {
  expect(handleInput(validInput)).toBe('valid');
});

it('should return invalid for invalid input', () => {
  expect(handleInput(invalidInput)).toBe('invalid');
});
```

---

## Getting Help

**Questions about testing standards?**
- Check: `_bmad/bmm/testarch/knowledge/` - TEA knowledge base
- Run: `bmad tea` - Ask TEA (Test Architect) agent
- Ask: In team Slack #engineering channel

**Found an issue with these standards?**
- Create PR to update this document
- Discuss in team retrospective
- Standards should evolve with the project

---

## Revision History

| Date       | Author | Changes                     |
| ---------- | ------ | --------------------------- |
| 2026-01-04 | Sid    | Initial version             |
| TBD        | -      | Updates based on experience |

---

**Remember**: These standards exist to help us ship quality software faster. If a standard doesn't make sense for your use case, discuss with the team - don't just ignore it.

Good tests are an investment that pays dividends every time we refactor, add features, or onboard new team members. 🎯
