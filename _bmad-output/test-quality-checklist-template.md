# Test Quality Checklist Template

**Add this section to every story file after the Acceptance Criteria section.**

---

## Test Approach

### Testarch Workflows
- [ ] **testarch-test-design** run? (Required for complex features with >5 ACs)
- [ ] **testarch-atdd** tests written FIRST? (Required for new features)
- [ ] **testarch-test-review** passed before PR? (Required for all stories)

### Test Data
- [ ] Data factories used (not hardcoded data)?
- [ ] Factory overrides used for test-specific values?
- [ ] Realistic test data (using faker)?

### Test Quality
- [ ] Mocking minimized (<3 module mocks per file)?
- [ ] BDD structure (Given-When-Then)?
- [ ] Test file ≤300 lines (or split into focused files)?
- [ ] Explicit assertions (no vague `toBeTruthy()`)?
- [ ] Test priorities assigned (P0/P1/P2/P3)?

### Test Coverage
- [ ] All acceptance criteria have corresponding tests?
- [ ] Edge cases covered?
- [ ] Error paths tested?
- [ ] Coverage thresholds met (≥85/78/85/85)?

### Test Execution
- [ ] All tests passing locally?
- [ ] No flaky tests (passed burn-in if added)?
- [ ] No hard waits (setTimeout, sleep)?
- [ ] Tests deterministic (same result every run)?
- [ ] CI passing (tests + coverage)?

---

## Example: How to Add to Story File

```markdown
# Story X.Y: Feature Name

## Acceptance Criteria

1. Given..., When..., Then...
2. Given..., When..., Then...

## Test Approach

### Testarch Workflows
- [x] testarch-test-design run?
- [x] testarch-atdd tests written FIRST?
- [ ] testarch-test-review passed before PR? (run before submitting)

### Test Data
- [x] Data factories used (`createAgentLoopOptions`, `createSlackEvent`)
- [x] Factory overrides for test-specific values
- [x] Realistic test data using faker

### Test Quality
- [x] Mocking minimized (only mocked Anthropic SDK at boundary)
- [x] BDD structure (all tests have Given-When-Then)
- [x] Test file 287 lines (within limits)
- [x] Explicit assertions
- [x] Test priorities assigned (5 P0, 12 P1, 3 P2)

### Test Coverage
- [x] All 7 acceptance criteria tested
- [x] Edge cases: empty input, malformed data, network errors
- [x] Error paths: API failures, validation errors
- [x] Coverage: 91.2% statements (exceeds thresholds)

### Test Execution
- [x] All 20 tests passing locally
- [x] No flaky tests
- [x] No hard waits
- [x] Deterministic
- [x] CI passing

## Tasks / Subtasks

[... rest of story ...]
```

---

## For Story Creators

**When creating a new story**:
1. Copy this checklist into the story file
2. Add after Acceptance Criteria section
3. Check off items as you complete them
4. Use this as your test quality gate before marking story done

**When reviewing a PR**:
1. Verify checklist is present and completed
2. Spot-check a few items (especially testarch workflows)
3. If checklist items are unchecked, story is not done

---

## Integration with dev-story Workflow

The dev-story workflow should automatically include this checklist in new stories. If your story was created before this standard, add the checklist manually.

**For existing stories without checklist**:
```bash
# Add checklist to story file
cat _bmad-output/test-quality-checklist-template.md >> _bmad-output/implementation-artifacts/stories/your-story.md
# Edit to fit after Acceptance Criteria section
```
