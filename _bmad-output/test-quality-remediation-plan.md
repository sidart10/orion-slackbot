# Test Quality Remediation Plan
## Orion Slack Agent - Systematic Test Improvement

**Created**: 2026-01-04
**Owner**: Sid
**Status**: In Progress
**Advisor**: TEA (Murat)

---

## Updated Status (Post-Fix)

✅ **All 5 failing tests are now FIXED!**
- Test Files: 83 passed (100%)
- Tests: 1,132 passed | 2 skipped
- Duration: 3.45s

**Revised Quality Score**: 72/100 (B- - Acceptable with improvements needed)
- Was: 62/100 (C)
- Improvement: +10 points for fixing critical failures
- Still needs work on: Over-mocking, data factories, BDD structure

---

## The Right Way Forward: Integrated Testarch Workflow

### Phase 0: Immediate Setup (Today)
**Goal**: Integrate testarch into your development process

#### Task 0.1: Add Coverage Enforcement to CI ⏱️ 30 min
**Priority**: P0 (Blocks future quality degradation)

**Action Items**:
1. Update `vitest.config.ts` with coverage thresholds
2. Update `.github/workflows/ci.yml` to enforce coverage
3. Create baseline coverage report

**Files to modify**:
- `vitest.config.ts`
- `.github/workflows/ci.yml`

**Success Criteria**:
- CI fails if coverage drops below thresholds
- Coverage reports uploaded to artifacts
- Team can see coverage trends

---

#### Task 0.2: Create Test Quality Standards Document ⏱️ 20 min
**Priority**: P0 (Establishes team agreement)

**Action Items**:
1. Create `docs/testing-standards.md`
2. Document factory pattern requirements
3. Document mocking guidelines
4. Add to PR template checklist

**Success Criteria**:
- Team has clear, written standards
- Standards reference BMM testarch principles
- Examples of good/bad patterns included

---

#### Task 0.3: Set Up Testarch Workflow Triggers ⏱️ 15 min
**Priority**: P0 (Process integration)

**Action Items**:
1. Add testarch workflow reminders to story template
2. Update PR checklist with test quality review
3. Create `.bmad/testarch-config.yaml` for team settings

**Success Criteria**:
- Developers know when to use testarch workflows
- Test quality is checked before merge
- Process is documented and visible

---

### Phase 1: Stop the Bleeding (This Sprint - Week 1-2)
**Goal**: Prevent new test debt from accumulating

#### Task 1.1: Create Core Data Factory Module ⏱️ 4 hours
**Priority**: P1 (Establishes new pattern)

**Action Items**:
1. Create `tests/factories/` directory structure
2. Implement `agent-factory.ts` (most commonly used)
3. Implement `slack-factory.ts` (second most common)
4. Document usage in testing-standards.md
5. Refactor 10 tests to use new factories

**Files to create**:
```
tests/
  └── factories/
      ├── index.ts
      ├── agent-factory.ts
      ├── slack-factory.ts
      └── README.md
```

**Success Criteria**:
- Factories use `@faker-js/faker` for realistic data
- Support override pattern for flexibility
- 10+ tests successfully refactored
- Measurable improvement in test readability

**Estimated Impact**:
- Reduces hardcoded test data by ~15%
- Sets pattern for rest of team
- Creates momentum for factory adoption

---

#### Task 1.2: Add BDD Structure to High-Value Tests ⏱️ 3 hours
**Priority**: P2 (Improves readability)

**Action Items**:
1. Identify top 20 most critical tests (P0 functionality)
2. Add Given-When-Then comments to each
3. Create template for future tests

**Target Tests**:
- Agent loop core functionality
- Message handling
- Tool execution
- Memory operations

**Success Criteria**:
- 20 tests have clear GWT structure
- Template available for team
- Improved test documentation

---

#### Task 1.3: Split Oversized Test Files ⏱️ 4 hours
**Priority**: P2 (Improves maintainability)

**Target Files** (>1,000 lines):
1. `agent/loop.test.ts` (1,678 lines) → Split into 4 files
2. `tools/mcp/client.test.ts` (1,351 lines) → Split into 3 files
3. `slack/handlers/user-message.test.ts` (1,127 lines) → Split into 3 files

**New Structure Example** (`agent/loop/`):
```
agent/
  └── loop/
      ├── loop.streaming.test.ts      # Streaming tests
      ├── loop.verification.test.ts   # Verification & retry
      ├── loop.tool-execution.test.ts # Tool use
      └── loop.citations.test.ts      # Source citations
```

**Success Criteria**:
- All test files < 500 lines
- Tests organized by concern
- No functionality lost in split

---

### Phase 2: Reduce Technical Debt (Sprint 2-3)
**Goal**: Systematically improve existing tests

#### Task 2.1: Reduce Mocking by 50% ⏱️ 8 hours spread over 2 weeks
**Priority**: P1 (Core quality improvement)

**Strategy**: File-by-file refactoring during regular work
- When touching a file for feature work, improve its tests
- Replace module mocks with dependency injection
- Use real implementations where possible

**Target**: Reduce from 347 mocks to <175

**Approach**:
```typescript
// From: Module-level mock (brittle)
vi.mock('@anthropic-ai/sdk', () => ({ /* ... */ }));

// To: Dependency injection (flexible)
function createTestClient(overrides = {}) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ /* ... */ }),
    },
    ...overrides,
  };
}

// Usage in test
const client = createTestClient();
const result = await executeAgentLoop('Hi', { client });
```

**Success Criteria**:
- Mock count reduced by 50%
- Tests run against more real code
- Test stability improves
- Refactoring becomes easier

**Progress Tracking**:
```bash
# Check mock count weekly
grep -r "vi.mock" src/**/*.test.ts | wc -l
```

---

#### Task 2.2: Add Test Priority Tags ⏱️ 2 hours
**Priority**: P2 (Enables selective testing)

**Action Items**:
1. Review all tests and classify P0/P1/P2/P3
2. Add test tags using Vitest metadata
3. Create smoke test suite (P0 only)
4. Update CI to run smoke tests on every commit

**Tag Structure**:
```typescript
it('should handle authentication', { tags: ['P0', 'smoke', 'auth'] }, async () => {
  // Critical authentication test
});

it('should format timestamps', { tags: ['P3', 'formatting'] }, async () => {
  // Nice-to-have test
});
```

**Success Criteria**:
- All tests tagged by priority
- Smoke suite runs in <1s
- Can run P0 tests independently

---

#### Task 2.3: Implement Test Burn-In for Flakiness Detection ⏱️ 2 hours
**Priority**: P2 (Prevents flaky tests)

**Action Items**:
1. Add burn-in job to CI (runs tests 10x)
2. Set up to run on PR only (not every commit)
3. Document how to diagnose flaky tests

**CI Configuration**:
```yaml
burn-in:
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - name: Run tests 10 times
      run: |
        for i in {1..10}; do
          echo "=== Burn-in iteration $i/10 ==="
          pnpm test || exit 1
        done
```

**Success Criteria**:
- Flaky tests detected before merge
- False positive rate < 1%
- Team knows how to fix flaky tests

---

### Phase 3: New Features Done Right (Ongoing)
**Goal**: All new code follows best practices

#### Integration with dev-story Workflow

**Modified Workflow**:
```bash
# BEFORE (old way - tests after implementation)
1. Read story
2. Implement feature
3. Write tests for coverage
4. Submit PR

# AFTER (new way - testarch integrated)
1. Read story
2. Run: bmad tea → testarch-test-design (if needed)
3. Run: bmad tea → testarch-atdd (write tests FIRST)
4. Implement feature to make tests pass
5. Run: bmad tea → testarch-test-review (quality check)
6. Submit PR (with test quality approval)
```

#### Story Template Update

Add to story files:
```markdown
## Test Approach
- [ ] testarch-test-design run? (for complex features)
- [ ] testarch-atdd tests written first?
- [ ] Data factories used (not hardcoded data)?
- [ ] Mocking minimized (<3 mocks per file)?
- [ ] BDD structure (Given-When-Then)?
- [ ] testarch-test-review passed?

## Test Quality Checklist
- [ ] All tests pass
- [ ] No module-level mocks added
- [ ] Data factories used for test data
- [ ] BDD structure in place
- [ ] Test file < 300 lines
- [ ] Coverage maintained/improved
```

---

## Weekly Metrics Dashboard

Track improvement over time:

| Metric                  | Baseline (Today) | Week 1 | Week 2 | Week 4 | Target |
| ----------------------- | ---------------- | ------ | ------ | ------ | ------ |
| Tests Passing           | 1,132/1,134      | -      | -      | -      | 100%   |
| Module Mocks Count      | 347              | -      | -      | -      | <175   |
| Data Factory Usage      | 5 refs           | -      | -      | -      | 80%+   |
| BDD Structure           | 2/1,134          | -      | -      | -      | 100%   |
| Files >500 lines        | 7                | -      | -      | -      | 0      |
| Coverage (statements)   | Unknown          | -      | -      | -      | >80%   |
| Test Quality Score      | 72/100           | -      | -      | -      | >85    |

**How to Track**:
```bash
# Run weekly quality check
cd /Users/sid/Desktop/2-Coding/Active/2025-12\ orion-slack-agent

# Mock count
echo "Module mocks: $(grep -r "vi.mock" src/**/*.test.ts | wc -l)"

# Factory usage
echo "Factory references: $(grep -r "factory\|Factory" src/**/*.test.ts | wc -l)"

# BDD structure
echo "BDD comments: $(grep -r "// Given\|// When\|// Then" src/**/*.test.ts | wc -l)"

# Large files
echo "Files >500 lines:"
find src -name "*.test.ts" -exec sh -c 'lines=$(wc -l < "$1"); if [ $lines -gt 500 ]; then echo "$1: $lines"; fi' _ {} \;

# Coverage
pnpm test:coverage | grep "All files"
```

---

## Risk Mitigation

### Risk 1: Team Pushback on Extra Process
**Mitigation**:
- Start with new features only (don't force refactoring)
- Show quick wins (factories make tests easier!)
- Lead by example with proof-of-concept

### Risk 2: Factories Feel Like Overhead
**Mitigation**:
- Start with just 2 factories (agent, slack)
- Make them REALLY good (great docs, examples)
- Show before/after comparisons

### Risk 3: CI Takes Too Long with Burn-In
**Mitigation**:
- Only run burn-in on PR (not every commit)
- Make it optional initially
- Optimize if it becomes bottleneck

---

## Success Criteria (3-Month Target)

**Quantitative**:
- ✅ All tests passing (achieved!)
- Test quality score: 85+/100 (from 72)
- Module mocks: <175 (from 347)
- Data factory usage: 80%+ (from <1%)
- BDD structure: 100% (from 0.2%)
- Coverage: >80% statements
- Files >500 lines: 0 (from 7)

**Qualitative**:
- Team confidently refactors without breaking tests
- New tests follow best practices by default
- Test failures indicate real bugs (not brittleness)
- PR reviews focus on behavior, not test fixtures

---

## Team Communication Plan

### Week 1: Kickoff
- [ ] Team meeting: Present this plan
- [ ] Demo: Show factory pattern benefits
- [ ] Agreement: Commit to process for 1 sprint
- [ ] Resources: Share testing-standards.md

### Week 2-3: Training
- [ ] Workshop: Writing testable code
- [ ] Pair session: Refactor one file together
- [ ] Code review: Focus on test quality

### Week 4: Retrospective
- [ ] Review metrics dashboard
- [ ] Celebrate wins
- [ ] Adjust process based on feedback

---

## Rollback Plan

If this approach isn't working after 2 weeks:
1. Pause new initiatives
2. Keep only coverage enforcement (non-negotiable)
3. Retrospective: What went wrong?
4. Adjust: Smaller steps? Different priorities?

**Note**: Don't give up after first difficulty. Test quality improvement takes time but pays massive dividends.

---

## Resources

### Internal Documentation
- `_bmad-output/test-review.md` - Full test suite analysis
- `docs/testing-standards.md` - Team standards (to be created)
- `tests/factories/README.md` - Factory usage guide (to be created)

### BMM Testarch Workflows
- `bmad tea → testarch-atdd` - Acceptance test driven development
- `bmad tea → testarch-test-review` - Test quality review
- `bmad tea → testarch-test-design` - Test planning
- `bmad tea → testarch-framework` - Framework setup
- `bmad tea → testarch-automate` - Test automation expansion

### External References
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/)
- [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)

---

## Next Actions (Priority Order)

**TODAY** (2-3 hours):
1. ✅ Update vitest.config.ts with coverage thresholds
2. ✅ Update CI to enforce coverage
3. ✅ Create testing-standards.md
4. ✅ Add testarch reminders to process

**THIS WEEK** (8-10 hours):
1. Create agent-factory.ts and slack-factory.ts
2. Refactor 10 tests to use factories
3. Split largest test file (agent/loop.test.ts)
4. Add BDD structure to 5 critical tests

**NEXT SPRINT** (ongoing):
1. Continue reducing mocks during regular work
2. Add test priority tags
3. Implement burn-in for PRs
4. Track metrics weekly

---

**Remember**: Perfect is the enemy of good. Incremental improvement > big bang refactor.

Let's do this systematically and sustainably. 💪
