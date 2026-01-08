---
name: bmad-ralph
description: This skill implements autonomous story loops for BMAD (BMad Method) workflows using the Ralph pattern. Use this skill when the user wants to automate BMAD story implementation with test-first workflows (ATDD), autonomous overnight execution, or process multiple stories sequentially without context degradation. The skill orchestrates 8-step workflows (SM create → SM review → TEA atdd → TEA test-review → SM context → DEV develop → DEV review → DEV done) using fresh Claude Code instances per workflow step.
---

# BMAD Ralph - Autonomous Story Loop

## Overview

Autonomous implementation of BMAD workflows using the Ralph pattern - wake up to completed epics instead of manually running workflows. This skill adds autonomous orchestration to existing BMAD systems by spawning fresh Claude Code instances for each workflow step, reading state from files (sprint-status.yaml), and executing test-first development cycles automatically.

**Key Innovation:** Fresh AI context per workflow + Persistent state files = No context degradation across stories.

## Core Capabilities

### 1. Autonomous Story Loop (Story-at-a-Time)

Process ONE story through complete 8-step lifecycle automatically:

1. **SM: create-story** - Generate story file from backlog
2. **SM: story-review** - Validate drafted story (acceptance criteria, tasks, dev notes)
3. **TEA: atdd** - Generate failing acceptance tests (RED phase)
4. **TEA: test-review** - Quality audit of generated tests
5. **SM: story-context** - Assemble context XML from architecture/UX/tech-spec
6. **DEV: develop-story** - Implement code to make tests pass (GREEN phase)
7. **DEV: code-review** - Systematic validation of ACs and tasks
8. **DEV: story-done** - Mark complete if review approved

**Usage:**
```
Run BMAD Ralph story loop on my current project
```

or

```
Load bmad-ralph skill and process the next backlog story
```

The skill will:
- Find the first `backlog` story in `docs/sprint-status.yaml`
- Invoke fresh Claude Code for each of 8 workflow steps
- Create timestamped logs in `logs/` directory
- Stop if code review finds issues (human can investigate)

### 2. Test-First Workflow (ATDD)

Ralph enforces test-driven development by generating ATDD tests BEFORE implementation:

**RED Phase** (TEA: atdd):
- Generate failing acceptance tests
- Create fixtures and data factories
- Build test infrastructure
- Output: atdd-checklist with tests in RED state

**GREEN Phase** (DEV: develop-story):
- Implement code to make tests pass
- Follow TDD red-green-refactor cycle
- Use test safety net for refactoring

**Benefits:**
- Tests define "done" criteria before coding
- No implementation without tests
- Quality gates enforced automatically

### 3. Fresh Context Per Workflow

Each workflow gets completely fresh Claude Code instance:

**Traditional Problem:**
```
Story 1: 4k tokens context
Story 2: 12k tokens (accumulated)
Story 3: 28k tokens (degraded quality)
Story 4: 65k tokens (incoherent)
```

**Ralph Solution:**
```
Story 1: 2k tokens (fresh!)
Story 2: 2k tokens (fresh!)
Story 3: 2k tokens (fresh!)
Story 4: 2k tokens (fresh!)
```

**State Persistence:**
Memory persists via BMAD files, not AI context:
- `sprint-status.yaml` - Story status transitions
- Story files - Dev Agent Record with learnings
- Epic context files - Technical guidance
- ATDD checklists - Test specifications

## When to Use This Skill

Use bmad-ralph skill when:

1. **Automating BMAD Stories** - Process stories without manual workflow orchestration
2. **Overnight Execution** - Run stories while sleeping, wake up to completed work
3. **Test-First Development** - Enforce ATDD before implementation
4. **Avoiding Context Degradation** - Fresh AI per workflow maintains quality
5. **Sequential Story Processing** - Process multiple stories with accumulated learnings

**Trigger phrases:**
- "Run BMAD Ralph on my project"
- "Process next story automatically"
- "Automate BMAD story workflow"
- "Run story loop with ATDD"
- "Execute story with test-first approach"

## Quick Start

### Prerequisites

1. **BMAD workflows installed** - Project must have BMAD workflow system
2. **Claude Code CLI** - Must be able to invoke `claude-code` command
3. **Project structure** - Must have `docs/sprint-status.yaml` with stories in backlog

### Running the Story Loop

Navigate to BMAD project root and run:

```bash
cd your-bmad-project
/path/to/.claude/skills/bmad-ralph/scripts/bmad-ralph-story.sh
```

**What happens:**
1. Script finds first `backlog` story in sprint-status.yaml
2. Invokes `claude-code` 8 times (fresh instance per workflow)
3. Each workflow reads state from files
4. Each workflow writes state back to files
5. Logs all steps with timestamps to `logs/ralph-TIMESTAMP.log`
6. Story goes from `backlog` → `done` if all steps pass

### Configuration

Set environment variables to customize:

```bash
export SPRINT_STATUS="docs/sprint-status.yaml"  # default
export STORY_FILES_PATH="docs/stories"          # default
export INVOCATION_METHOD="stdin"                # stdin/skill/file/direct
```

## How It Works

### The Ralph Pattern

Ralph implements autonomous AI loops:

```bash
while not_complete:
  fresh_ai_instance | read_state_from_files
  run_workflow()
  write_state_to_files()
```

**Key Principles:**
1. **Fresh AI per workflow** - No context accumulation
2. **State in files** - Not in AI memory
3. **Quality gates** - test-review + code-review before done
4. **Learning accumulation** - Dev Agent Record persists

### State Management

**Reads from:**
- `sprint-status.yaml` - Which stories are backlog/drafted/ready/done
- Story files - Previous learnings (Dev Agent Record)
- Epic context files - Technical guidance
- Architecture/UX/tech-spec - System design docs

**Writes to:**
- Story status transitions in sprint-status.yaml
- Story files with implementation details
- ATDD checklists with test specifications
- Code review sections with outcomes
- Dev Agent Record with learnings

### Workflow Invocation

Ralph invokes Claude Code using stdin heredoc (like original Ralph):

```bash
claude-code <<EOF
Load SM agent
Run create-story workflow
EOF
```

**Alternative methods available:**
- Skill invocation: `claude-code --skill bmad:bmm:workflows:create-story`
- File-based: Write prompt to temp file, invoke with `--file`
- Direct argument: `claude-code "Load SM agent..."`

Configure via `INVOCATION_METHOD` environment variable.

### Quality Gates

Ralph enforces quality before advancing:

**Test Quality Gate** (TEA: test-review):
- Validates ATDD tests against 12 criteria
- Checks for determinism, isolation, fixtures
- 0-100 score with letter grades (A+/A/B/C/F)
- Identifies critical issues (P0/P1)

**Code Quality Gate** (DEV: code-review):
- Systematic validation of acceptance criteria
- Checks all tasks completed
- Reviews code quality and patterns
- Outcomes: Approve / Changes Requested / Blocked

**Story only advances if both gates pass.**

## Workflow Details

### Step 1: SM create-story

**What it does:**
- Finds first `backlog` story in sprint-status.yaml (top-to-bottom order)
- Reads epic context and architecture docs
- Extracts learnings from previous story (Dev Agent Record)
- Creates story-{key}.md file with ACs, tasks, dev notes

**State transition:** `backlog` → `drafted`

**Verification:** Story file exists at `docs/stories/story-{key}.md`

### Step 2: SM story-review

**What it does:**
- Validates drafted story completeness
- Checks acceptance criteria clarity
- Verifies tasks are actionable
- Ensures dev notes provide context

**Purpose:** Catch issues before expensive test/dev work

**Verification:** Story has complete sections

### Step 3: TEA atdd (Acceptance Test-Driven Development)

**What it does:**
- Loads story context, requirements, test framework config
- Loads 8 knowledge base fragments (fixtures, data factories, network-first patterns, etc.)
- Generates FAILING tests in RED phase
- Applies Given-When-Then format
- Creates data factories with faker.js
- Builds fixture infrastructure with auto-cleanup
- Creates implementation checklist

**Output:** `docs/stories/atdd-checklist-{key}.md`

**State:** Tests are RED (failing) - this is correct!

**Verification:** ATDD checklist file exists

### Step 4: TEA test-review

**What it does:**
- Reviews ATDD tests against 12 quality criteria
- Checks BDD format, test IDs, determinism, isolation
- Validates fixture patterns, data factories
- Ensures network-first patterns (intercept before navigate)
- Calculates quality score (0-100)

**Quality Criteria:**
- BDD Format (Given-When-Then)
- Test IDs present
- No hard waits (use deterministic waits)
- No conditionals/random data
- Proper isolation (cleanup, no shared state)
- Fixture patterns (pure fn → Fixture → mergeTests)
- Data factories (factory functions, not hardcoded)
- Network-first (intercept routes before navigation)
- Explicit assertions
- Test length (≤300 lines)
- Test duration (≤1.5 min)
- No flaky patterns

**Output:** Quality score and recommendations

**Verification:** Test review section in story file

### Step 5: SM story-context

**What it does:**
- Assembles context XML from multiple sources:
  - Architecture docs
  - UX design specs
  - Tech spec
  - Epic tech context
  - Previous story learnings
- Links all relevant documentation
- Marks story ready for development

**Output:** `docs/stories/{key}.context.xml`

**State transition:** `drafted` → `ready-for-dev`

**Verification:** Context XML file exists

### Step 6: DEV develop-story

**What it does:**
- Loads story with context XML
- Loads ATDD tests (currently RED/failing)
- Implements code to make tests pass (GREEN phase)
- Follows TDD red-green-refactor cycle
- Updates Dev Agent Record with learnings:
  - New patterns/services created
  - Architectural decisions made
  - Technical debt deferred
  - Warnings for next story

**State transition:** `ready-for-dev` → `in-progress` → `review`

**Verification:** Tests now pass, code committed

### Step 7: DEV code-review

**What it does:**
- Adversarial senior developer review
- Validates ALL acceptance criteria met
- Checks ALL tasks completed
- Reviews code quality and patterns
- Verifies tests are comprehensive
- Ensures no shortcuts taken

**Review Outcomes:**
- **Approve** - Story ready to be marked done
- **Changes Requested** - Issues found, needs fixes
- **Blocked** - External dependency or blocker

**Verification:** Review section added to story file

### Step 8: DEV story-done

**Only runs if code-review approved.**

**What it does:**
- Marks story complete in sprint-status.yaml
- Updates story status
- Advances to next story in backlog

**State transition:** `review` → `done`

**Verification:** Story status is `done` in sprint-status.yaml

## Troubleshooting

### Issue: "No stories in backlog"

**Cause:** All stories already done or sprint-status.yaml not found

**Fix:**
```bash
# Check sprint status
cat docs/sprint-status.yaml

# Verify stories exist with "backlog" status
yq '.development_status' docs/sprint-status.yaml
```

### Issue: "Story file not created"

**Cause:** create-story workflow failed

**Fix:**
1. Check logs: `cat logs/ralph-*.log`
2. Verify sprint-status.yaml format is correct
3. Ensure epic context exists if using BMad Method

### Issue: "Code review found issues"

**Cause:** Code review workflow flagged problems (EXPECTED!)

**Fix:**
1. Review story file: `cat docs/stories/story-{id}.md`
2. Check "Senior Developer Review" section
3. Address review items manually or re-run develop-story
4. Run story loop again

### Issue: claude-code command not found

**Cause:** Claude Code CLI not in PATH

**Fix:**
```bash
# Check if installed
which claude-code

# Add to PATH if needed
export PATH="/path/to/claude-code:$PATH"
```

## Advanced Usage

### Custom Workflow Sequence

By default, Ralph runs all 8 steps. To customize which workflows run, edit the story loop script or set environment variables to skip certain steps.

### Epic-Level Setup

For wiser approach, run epic-level workflows once before story loop:

```bash
# Run once per epic
claude-code <<EOF
Load TEA agent
Run test-design workflow for epic-1
EOF

claude-code <<EOF
Load SM agent
Run epic-tech-context workflow
EOF

# Then run story loop multiple times
./bmad-ralph-story.sh  # Story 1
./bmad-ralph-story.sh  # Story 2
./bmad-ralph-story.sh  # Story 3
```

### Logging and Monitoring

**View logs in real-time:**
```bash
tail -f logs/ralph-*.log
```

**Check sprint status:**
```bash
cat docs/sprint-status.yaml
```

**Analyze logs:**
```bash
# Search for errors
grep ERROR logs/ralph-*.log

# Count completed steps
grep "SUCCESS.*completed" logs/ralph-*.log | wc -l
```

## Resources

### scripts/

**bmad-ralph-story.sh** - Main story loop script
- Orchestrates 8-step workflow
- Handles state management
- Invokes fresh Claude Code per step
- Logs all actions with timestamps

**lib/log.sh** - Logging utilities
- Timestamp logging
- Log levels (INFO, SUCCESS, ERROR, STEP)
- Outputs to both console and log file

**lib/check-status.sh** - YAML parsing
- Reads sprint-status.yaml
- Finds next backlog story
- Gets story status
- Counts remaining stories in epic

**lib/invoke-workflow.sh** - Workflow invocation
- Invokes Claude Code with workflows
- Supports multiple invocation methods
- Tests all 4 methods to find what works
- Logs invocation success/failure

**lib/detect-completion.sh** - Completion detection
- Checks code review outcomes
- Parses story files for review sections
- Verifies files exist (story, ATDD, context)

### references/

**bmad-workflow-reference.md** - Complete BMAD workflow documentation
- Phase 1-4 workflow descriptions
- Agent responsibilities (SM, TEA, DEV)
- Story lifecycle states
- Quality gate criteria

### assets/

**test-project/** - Minimal test project for validation
- Example sprint-status.yaml
- Directory structure for stories/epics
- Can be used to test Ralph before running on real projects

## What Ralph Adds to BMAD

**BMAD already provides (90%):**
- ✅ All workflows (create-story, atdd, develop-story, code-review, etc.)
- ✅ State tracking (sprint-status.yaml)
- ✅ Quality gates (test-review, code-review)
- ✅ Learning accumulation (Dev Agent Record)
- ✅ Agent personas (SM, DEV, TEA)
- ✅ Test-first approach (ATDD before implementation)

**Ralph adds (10%):**
- 🆕 Autonomous orchestration - Bash loop calling workflows
- 🆕 Fresh context per workflow - No degradation
- 🆕 Overnight execution - Unattended operation
- 🆕 Retry logic - If review fails, human can re-run
- 🆕 Epic-level setup - Auto-run test-design + epic-tech-context

**Ralph is just the loop** that orchestrates BMAD's existing, well-designed system.

## Credits

- **BMAD (BMad Method)** - The workflow system being automated
- **Ralph** - Original autonomous loop pattern by [@snarktank](https://github.com/snarktank/ralph)
- **Claude Code** - Anthropic's Claude AI for coding

---

**Built with Claude Code via Happy**

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
