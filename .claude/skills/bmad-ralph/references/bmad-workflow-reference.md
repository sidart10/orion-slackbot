# BMAD Workflow Reference

Complete reference for BMAD (BMad Method) workflows integrated with Ralph autonomous loops.

## Phase Overview

- **Phase 1:** Analysis (Optional, Manual)
- **Phase 2:** Planning (Required, Manual)
- **Phase 3:** Solutioning (BMad/Enterprise only, Manual)
- **Phase 4:** Implementation **(Ralph automates this!)**

## Phase 4: Implementation (Ralph Territory)

### Agent Responsibilities

**SM (Scrum Master):**
- create-story - Generate story from backlog
- story-review - Validate drafted story
- story-context - Assemble context XML
- epic-tech-context - Epic technical guidance (once per epic)

**TEA (Test Architect):**
- test-design - Epic test strategy (once per epic)
- atdd - Generate failing acceptance tests
- test-review - Quality audit of tests

**DEV (Developer):**
- develop-story - Implement to make tests pass
- code-review - Adversarial validation
- story-done - Mark complete

### Story Lifecycle States

1. **backlog** - Story identified, not started
2. **drafted** - Story file created (after create-story)
3. **ready-for-dev** - Context generated, ready for implementation (after story-context)
4. **in-progress** - Being implemented (during develop-story)
5. **review** - Implementation complete, awaiting review (after develop-story)
6. **done** - Approved and complete (after story-done)

### Quality Gate Criteria

**TEA test-review (12 criteria):**
1. BDD Format - Given-When-Then present
2. Test IDs - All tests have unique IDs
3. No Hard Waits - Use deterministic waits
4. Determinism - No conditionals/random data
5. Isolation - Clean up, no shared state
6. Fixture Patterns - Pure fn → Fixture → mergeTests
7. Data Factories - Factory functions, not hardcoded
8. Network-First - Intercept routes before navigation
9. Assertions - Explicit assertions present
10. Test Length - ≤300 lines per test
11. Test Duration - ≤1.5 minutes per test
12. Flakiness - No flaky patterns detected

**Scoring:** 0-100 with letter grades (A+/A/B/C/F)

**DEV code-review outcomes:**
- **Approve** - All ACs met, all tasks done, quality good
- **Changes Requested** - Issues found, needs revision
- **Blocked** - External dependency or blocker

### Dev Agent Record

Each story accumulates learnings for future stories:
- New patterns/services created (to reuse)
- Architectural decisions made
- Technical debt deferred
- Warnings for next story

**Ralph reads this** when creating the next story to benefit from previous learnings.

## Ralph Integration Points

### State Files Ralph Reads

- `docs/sprint-status.yaml` - Which stories are backlog/done
- `docs/stories/story-{key}.md` - Story content and Dev Agent Record
- `docs/epics/epic-{number}-tech-context.md` - Epic technical guidance
- `docs/architecture.md` - System architecture
- `docs/ux-design.md` - UX specifications
- `docs/tech-spec.md` - Technical specifications

### State Files Ralph Writes

- `docs/sprint-status.yaml` - Story status updates
- `docs/stories/story-{key}.md` - Story file with all sections
- `docs/stories/atdd-checklist-{key}.md` - ATDD test specifications
- `docs/stories/{key}.context.xml` - Assembled context
- `logs/ralph-TIMESTAMP.log` - Execution logs

### Workflow Invocation Pattern

Ralph uses fresh Claude Code per workflow:

```bash
# Step 1
claude-code <<EOF
Load SM agent
Run create-story workflow
EOF

# Step 2
claude-code <<EOF
Load SM agent
Review drafted story
EOF

# Step 3
claude-code <<EOF
Load TEA agent
Run atdd workflow
EOF

# ... 8 total invocations
```

Each invocation:
1. Gets completely fresh context
2. Reads state from files
3. Executes workflow
4. Writes state back to files
5. Exits

**No context accumulation = No quality degradation**

## Typical Story Flow with Ralph

1. **Human:** Run `bmad-ralph-story.sh`
2. **Ralph:** Find `1-1-user-auth` in backlog
3. **SM (fresh):** create-story → creates story-1-1-user-auth.md
4. **SM (fresh):** review story → validates it's complete
5. **TEA (fresh):** atdd → generates failing tests (RED)
6. **TEA (fresh):** test-review → scores quality 92/100 (A)
7. **SM (fresh):** story-context → creates context.xml
8. **DEV (fresh):** develop-story → implements code (tests GREEN)
9. **DEV (fresh):** code-review → "Approve"
10. **DEV (fresh):** story-done → marks done in sprint-status.yaml
11. **Ralph:** Story complete! Run again for next story.

## Comparison: Manual vs Ralph

**Manual BMAD:**
```
You: "Load SM agent"
SM: *loads*
You: "Run create-story"
SM: *creates story*
You: "Load TEA agent"
TEA: *loads*
You: "Run atdd"
[...8 manual steps...]
```

**Ralph BMAD:**
```
You: "./bmad-ralph-story.sh"
[Go to bed]
[Wake up to completed story]
```

## Epic-Level Optimization

Ralph can run epic setup once, then process all stories:

```bash
# Once per epic
claude-code <<EOF
Load TEA agent
Run test-design for epic-1
EOF

claude-code <<EOF
Load SM agent
Run epic-tech-context
EOF

# Then loop stories
./bmad-ralph-story.sh  # Story 1
./bmad-ralph-story.sh  # Story 2
./bmad-ralph-story.sh  # Story 3
```

This is "wiser" because:
- Test strategy defined once for all stories
- Epic technical context shared across stories
- Avoids redundant epic-level work

## When Ralph Stops

Ralph stops and requires human intervention when:

1. **Code review fails** - Changes requested or blocked
2. **Tests fail** - Cannot make tests pass
3. **Story file missing** - Workflow didn't create expected file
4. **No stories in backlog** - All stories complete

Human reviews issue, fixes if needed, re-runs Ralph.

## What Makes Ralph Work

1. **Fresh AI per workflow** - No context bloat
2. **File-based state** - Not AI memory
3. **Quality gates** - test-review + code-review
4. **Learning accumulation** - Dev Agent Record persists
5. **Simple bash loop** - Just orchestration, BMAD does the work

**Ralph is 10% of the system. BMAD is 90%.**

Ralph just adds the autonomous loop around BMAD's existing, well-designed workflows.
