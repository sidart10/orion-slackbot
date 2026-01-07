# Test Quality Quick Reference

**TL;DR**: Follow these practices to write maintainable, high-quality tests.

---

## ✅ The Checklist (Print This!)

```
Before submitting PR:
□ Tests written FIRST (or at least ATDD workflow used)
□ Data factories used (no hardcoded test data)
□ Minimal mocking (<3 module mocks per file)
□ BDD structure (Given-When-Then comments)
□ Test file ≤300 lines
□ All tests passing
□ Coverage ≥85/78/85/85
□ testarch-test-review passed
□ Story test checklist completed
```

---

## 🚀 Quick Workflows

### New Feature
```bash
# 1. Start story
bmad tea → testarch-atdd  # Write tests FIRST

# 2. Implement to make tests pass
# (code here)

# 3. Before PR
bmad tea → testarch-test-review

# 4. Submit PR
```

### Refactoring Existing Code
```bash
# When touching a file
bmad tea → testarch-test-review

# Review shows issues → fix them
# Then refactor code
# Tests keep passing = good refactor!
```

---

## 💉 Mocking Rules (Minimize!)

**DO mock**:
- ✅ External HTTP APIs (Slack, Anthropic)
- ✅ File system
- ✅ Time/dates (when testing time logic)

**DON'T mock**:
- ❌ Internal modules
- ❌ Business logic
- ❌ Config (use test config)
- ❌ Logger (use silent logger)

**Example**:
```typescript
// ✅ Good - mock at boundary
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

// ❌ Bad - mock internal module
vi.mock('../database');
vi.mock('../validator');
vi.mock('../formatter');
```

---

## 🏭 Data Factory Pattern

**Don't do this**:
```typescript
const event = {
  type: 'app_mention',
  channel: 'C123456',
  user: 'U123456',
  text: '<@UBOT> hello',
  ts: '1234567890.123456',
};
```

**Do this**:
```typescript
import { createAppMentionEvent } from '../../tests/factories';

const event = createAppMentionEvent({
  text: '<@UBOT> hello',  // Override only what matters
});
```

**Creating a factory**:
```typescript
// tests/factories/my-factory.ts
import { faker } from '@faker-js/faker';

export function createUser(overrides = {}) {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    ...overrides,
  };
}
```

---

## 📋 BDD Structure (Given-When-Then)

**Every test should look like this**:
```typescript
it('should <behavior> when <condition>', async () => {
  // Given: Setup
  const user = createUser();
  const thread = createThread({ author: user.id });

  // When: Execute
  const result = await summarizeThread(thread);

  // Then: Assert
  expect(result.summary).toBeDefined();
  expect(result.author).toBe(user.id);
});
```

---

## 📊 Coverage Commands

```bash
# Run tests with coverage
pnpm test:coverage

# Check current coverage
pnpm test:coverage | grep "All files"

# Current thresholds (in vitest.config.ts):
# statements: 85%
# branches: 78%
# functions: 85%
# lines: 85%
```

---

## 🔧 Common Fixes

### "My test file is too large"
```bash
# Split into focused files
mkdir -p src/feature/tests
# Move related tests into separate files
# Each file <300 lines
```

### "I have too many mocks"
```typescript
// Instead of mocking modules...
vi.mock('../config');  // ❌

// Use dependency injection
function myFunction(config = defaultConfig) {  // ✅
  // Use config parameter
}

// In test
myFunction(testConfig);  // No mocking needed!
```

### "Test is flaky"
```typescript
// Never do this ❌
await sleep(1000);

// Do this ✅
await promise;  // Wait for actual completion

// Or use waitFor ✅
await vi.waitUntil(() => condition, { timeout: 5000 });
```

### "Hard to test this code"
```bash
# When code is hard to test, it's usually a design smell
# Use testarch-test-design to help:
bmad tea → testarch-test-design

# TEA will help you restructure for testability
```

---

## 🎯 Test Priorities

```typescript
// Tag tests by priority
it('critical test', { tags: ['P0', 'smoke'] }, () => {});
it('important test', { tags: ['P1'] }, () => {});
it('nice-to-have', { tags: ['P3'] }, () => {});

// Run smoke tests only
pnpm test --grep="@P0"
```

---

## 🆘 Getting Help

**Questions?**
- Read: `docs/testing-standards.md` (full guide)
- Ask: `bmad tea` (TEA agent)
- Check: `_bmad/bmm/testarch/knowledge/` (knowledge base)

**CI failing on coverage?**
```bash
# See which files have low coverage
pnpm test:coverage

# Focus on files below thresholds
# Add tests for uncovered lines
```

**Tests failing after refactor?**
```bash
# This means tests were too brittle (over-mocked)
# Refactor tests to reduce mocking
# Use dependency injection instead
```

---

## 📚 Key Files

- `docs/testing-standards.md` - Full standards guide
- `tests/factories/` - Data factory modules
- `_bmad-output/test-review.md` - Latest test quality audit
- `_bmad-output/test-quality-remediation-plan.md` - Improvement roadmap
- `vitest.config.ts` - Coverage configuration

---

## 🎓 Learn More

**Recommended Reading**:
- [Kent C. Dodds - Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Martin Fowler - Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) - Kent Beck's test principles

**Internal Resources**:
- BMM Testarch workflows: `bmad tea`
- TEA knowledge base: `_bmad/bmm/testarch/knowledge/`
- Sprint retrospectives: Review test quality improvements

---

**Remember**: Good tests are an investment. They make refactoring safe, onboarding faster, and bugs rare. The upfront effort pays massive dividends. 🎯
