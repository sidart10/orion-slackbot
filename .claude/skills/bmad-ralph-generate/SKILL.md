---
name: bmad-ralph-generate
description: "Autonomous story preparation for BMAD projects. This skill should be used when the user wants to create and prepare stories for development from their epics. It runs Steps 1-5 of the BMAD workflow (SM create-story, SM story-ready, TEA atdd, TEA test-review, SM story-context) with fresh agent context per step to prevent context degradation. Requires existing planning artifacts (prd.md, architecture.md, epics.md, sprint-status.yaml). Outputs stories in 'ready-for-dev' status for bmad-ralph-execute."
---

# BMAD Ralph Generate

Autonomous story preparation workflow that creates and prepares stories for development.

---

## ⚠️ CRITICAL EXECUTION RULE - READ THIS FIRST ⚠️

**YOU MUST SPAWN A NEW AGENT FOR EVERY SINGLE STEP.**

This is NON-NEGOTIABLE. The entire architecture depends on fresh context per step.

### What This Means:

```
❌ WRONG: Read files yourself and validate inline
❌ WRONG: Write context.xml yourself without spawning agent
❌ WRONG: Do step 2 or step 3 without Task tool

✅ CORRECT: Call Task tool for EVERY step (1, 2, 3, 4, 5)
✅ CORRECT: Each step = one Task() call = one fresh agent
✅ CORRECT: Never execute workflow logic yourself - always delegate
```

### Enforcement:

For EACH story, you must make these Task tool calls:
1. `Task(subagent_type="sm", description="SM create-story for {id}")` → Step 1
2. `Task(subagent_type="sm", description="SM story-ready for {id}")` → Step 2 ← **YES, SPAWN FOR VALIDATION TOO**
3. `Task(subagent_type="tea", description="TEA atdd for {id}")` → Step 3 (if TEA enabled)
4. `Task(subagent_type="tea", description="TEA test-review for {id}")` → Step 4 (if TEA enabled)
5. `Task(subagent_type="sm", description="SM story-context for {id}")` → Step 5 ← **YES, SPAWN FOR CONTEXT TOO**

**DO NOT validate stories yourself. DO NOT create context.xml yourself. SPAWN AGENTS.**

---

## Overview

Ralph Generate runs Steps 1-5 of the BMAD test-first development workflow with **fresh agent context per step**. This prevents context degradation that occurs when running multiple stories in a single session.

**Key Innovation:** Each workflow step spawns a fresh Claude Code agent via the Task tool, maintaining consistent quality across unlimited stories.

## When to Use

- User has completed BMAD planning (PRD, architecture, epics exist)
- User wants to prepare stories for development
- User says things like "create stories", "prepare stories for dev", "run ralph generate"

## Workflow Steps

| Step | Agent | Workflow | Output |
|------|-------|----------|--------|
| 1 | SM | create-story | story-{id}.md |
| 2 | SM | story-ready | story validated |
| 3 | TEA | atdd | atdd-checklist-{id}.md (optional) |
| 4 | TEA | test-review | tests validated (optional) |
| 5 | SM | story-context | {id}.context.xml |

**Status Transitions:** `backlog` → `drafted` → `ready-for-dev`

## Execution Flow

### Phase 1: Configuration (First Run Only)

If `.ralph/config.yaml` does not exist:

1. **Prompt for planning artifacts location:**
   ```
   📁 Where are your planning artifacts?
      (e.g., ./planning-artifacts):
   ```

2. **Validate the path contains required files:**
   - `prd.md` (required, min 100 chars)
   - `architecture.md` (required, min 100 chars)
   - `epics.md` (required, min 50 chars)
   - `sprint-status.yaml` (required)
   - `test-design.md` (required only if TEA enabled)

3. **Create `.ralph/config.yaml`** with validated settings

4. **Create `.ralph/paths.yaml`** with output path patterns

### Phase 2: TEA Agent Selection

Prompt user:
```
🧪 Include TEA agent for formal test design? (y/n)

   With TEA: Stories get formal ATDD checklists (Steps 3-4)
   Without TEA: DEV writes tests from acceptance criteria (Skip Steps 3-4)
```

Save preference to config.

### Phase 3: Epic Selection

1. **Parse sprint-status.yaml** to get epics and stories
2. **Display epic list with status breakdown:**
   ```
   📋 Available Epics (ordered by ID):
      1. Epic 1: User Authentication (4 stories: 3 backlog, 1 done)
      2. Epic 2: User Profile (3 stories: 3 backlog)
      3. Epic 3: Dashboard (5 stories: 5 backlog)
   ```

3. **Prompt for epic count:**
   ```
   ❓ How many epics would you like to create stories for? (1-3 or 'all'):
   ```

4. **Show execution plan and confirm:**
   ```
   📊 Execution Plan:
      • Epics: 2 (Epic 1, Epic 2)
      • Stories: 6 total (skipping 1 already done)
      • Steps per story: 5 (with TEA) or 3 (without TEA)

      Proceed? (y/n):
   ```

### Phase 4: Story Loop Execution

For each selected epic, for each story in `backlog` status:

1. **Check resume state** - Skip completed steps based on file existence
2. **Execute remaining steps** by spawning fresh agents
3. **Verify outputs** after each step
4. **Update sprint-status.yaml** on status transitions

## Agent Spawning

**EVERY STEP requires a Task tool call.** No exceptions. No inline execution.

Use the Task tool to spawn fresh agent instances. Each agent runs in **autonomous mode** - no menu, direct workflow execution.

### Prompt Construction

Ralph spawns fresh agents using the Task tool. Each step requires loading prompt templates from the `prompts/` directory.

**Pattern:**

1. **Load templates:**
   - Base: `prompts/autonomous_base.txt` (common to all steps)
   - Step-specific: `prompts/step_N_*.txt` (contains step details)

2. **Substitute variables:**
   - `{project_root}` - Project root path
   - `{story_id}` - Full story ID (e.g., "1-1-login")
   - `{epic_id}` - Epic number (e.g., "1")
   - `{planning_dir}` - Path to planning artifacts
   - `{impl_dir}` - Path to implementation artifacts
   - `{workflow_path}` - Relative path to workflow.yaml

3. **Combine and spawn:**
   ```python
   # Read prompt templates
   base_template = read_file("prompts/autonomous_base.txt")
   step_template = read_file("prompts/step_1_create_story.txt")

   # Combine and substitute
   full_prompt = base_template.format(**context_vars) + "\n\n" + step_template.format(**context_vars)

   # Spawn agent
   Task(
       subagent_type="sm",
       description="SM create-story for story-1-1-login",
       prompt=full_prompt
   )
   ```

**Workflow Paths (referenced in prompts):**

| Step | Agent | Workflow Path |
|------|-------|---------------|
| 1 | `sm` | `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml` |
| 2 | `sm` | `_bmad/bmm/workflows/4-implementation/create-story/checklist.md` |
| 3 | `tea` | `_bmad/bmm/workflows/testarch/atdd/workflow.yaml` |
| 4 | `tea` | `_bmad/bmm/workflows/testarch/test-review/workflow.yaml` |
| 5 | `sm` | `_bmad/bmm/workflows/4-implementation/story-context/workflow.yaml` |

**Execution Flow:**

For EACH story, spawn agents SEQUENTIALLY (wait for each to complete):

1. Task(subagent_type="sm", ...) → Step 1: Create story
2. Task(subagent_type="sm", ...) → Step 2: Validate story
3. Task(subagent_type="tea", ...) → Step 3: ATDD (if TEA enabled)
4. Task(subagent_type="tea", ...) → Step 4: Test review (if TEA enabled)
5. Task(subagent_type="sm", ...) → Step 5: Generate context

**CRITICAL:** DO NOT skip Task tool calls. DO NOT execute workflows inline. Each step = one Task() spawn.

## TEA Skip Logic

When user selects "No TEA agent":
- Skip Steps 3-4 entirely
- Step 5 context.xml references story AC directly (not atdd-checklist)
- Status transitions: `backlog` → Step 1 → `drafted` → Step 2 → Step 5 → `ready-for-dev`

## Resume Logic

Ralph can resume from partial completion:

| Status | Resume From |
|--------|-------------|
| `backlog` | Step 1 |
| `drafted` | Check file existence for steps 2-4 |
| `ready-for-dev` | Skip (already complete) |
| `done` | Skip (already complete) |

**File existence checks for `drafted` status:**
- story-{id}.md exists → Skip step 1
- story reviewed (timestamp check) → Skip step 2
- atdd-checklist-{id}.md exists → Skip step 3 (if TEA enabled)
- test review done (timestamp) → Skip step 4 (if TEA enabled)

## Error Handling

| Error Type | Action |
|------------|--------|
| AGENT_CRASH | Stop, log details, prompt user to fix |
| OUTPUT_MISSING | Stop, show missing file |
| INVALID_OUTPUT | Stop, show parse error |
| STATUS_UPDATE_FAILED | Stop, check permissions |
| TIMEOUT | Stop, user increases timeout |

On any error:
1. Log to `logs/ralph-generate-{timestamp}.log`
2. Display user-friendly error message
3. Exit cleanly - status remains at last successful state
4. User fixes issue and re-runs skill to resume

## Progress Display

Show real-time progress during execution:

```
🔄 Processing Epic 1: User Authentication...
   ├── ✅ Story 1-1-login [Step 1/5: SM create-story] ✓
   ├── ✅ Story 1-1-login [Step 2/5: SM story-ready] ✓
   ├── 🔄 Story 1-1-login [Step 3/5: TEA atdd] ...
```

## Output Files

After successful completion:

```
{impl_dir}/
├── stories/
│   ├── story-1-1-login.md
│   ├── story-1-2-logout.md
│   ├── atdd-checklist-1-1-login.md  (if TEA enabled)
│   ├── atdd-checklist-1-2-logout.md (if TEA enabled)
│   ├── 1-1-login.context.xml
│   └── 1-2-logout.context.xml
```

## Scripts

This skill uses helper scripts in `scripts/`:

- **config.py** - Configuration loading, validation, first-run setup
- **sprint_parser.py** - Parse sprint-status.yaml, extract epics/stories
- **step_executor.py** - Execute single step via Task tool
- **prompt_builder.py** - Build autonomous prompts from templates
- **progress.py** - Progress display utilities
- **error_handler.py** - Error categorization and messages
- **logger.py** - Logging with rotation
- **utils.py** - File locking, path utilities

## Prompts

Step-specific prompt templates in `prompts/`:

- `autonomous_base.txt` - Base template for all agents
- `step_1_create_story.txt` - SM create-story specific
- `step_2_story_ready.txt` - SM story-ready specific
- `step_3_atdd.txt` - TEA atdd specific
- `step_4_test_review.txt` - TEA test-review specific
- `step_5_story_context.txt` - SM story-context specific
- `step_5_story_context_no_tea.txt` - Variant when TEA disabled

## Configuration Files

### .ralph/config.yaml

```yaml
planning_dir: "./planning-artifacts"
impl_dir: "./implementation-artifacts"
use_tea_agent: true

step_timeouts:
  1: 10   # create-story (minutes)
  2: 5    # story-ready
  3: 15   # atdd
  4: 5    # test-review
  5: 10   # story-context
```

### .ralph/paths.yaml

```yaml
paths:
  story_file: "{impl_dir}/stories/story-{story_id}.md"
  atdd_checklist: "{impl_dir}/stories/atdd-checklist-{story_id}.md"
  context_xml: "{impl_dir}/stories/{story_id}.context.xml"
```

## Complete Execution Example

```
╔════════════════════════════════════════════════════════════════════╗
║  🚀 BMAD Ralph Generate - Story Preparation Workflow                ║
╚════════════════════════════════════════════════════════════════════╝

📂 Loading config from .ralph/config.yaml...
   ✅ Planning: ./planning-artifacts
   ✅ Implementation: ./implementation-artifacts

🧪 Include TEA agent for formal test design? (y/n): y

📋 Available Epics (ordered by ID):
   1. Epic 1: User Authentication (4 stories: 3 backlog, 1 done)
   2. Epic 2: User Profile (3 stories: 3 backlog)

❓ How many epics would you like to create stories for? (1-2 or 'all'): 1

═══════════════════════════════════════════════════════════════════════

📊 Execution Plan:
   • Epics: 1 (Epic 1)
   • Stories: 3 (skipping 1 already done)
   • Steps per story: 5 (with TEA)

   Proceed? (y/n): y

═══════════════════════════════════════════════════════════════════════

🔄 Processing Epic 1: User Authentication...
   ├── 🔄 Story 1-1-login [Step 1/5: SM create-story]
   │   └── ✅ Created: stories/story-1-1-login.md
   ├── 🔄 Story 1-1-login [Step 2/5: SM story-ready]
   │   └── ✅ Story validated and reviewed
   ├── 🔄 Story 1-1-login [Step 3/5: TEA atdd]
   │   └── ✅ Created: stories/atdd-checklist-1-1-login.md
   ├── 🔄 Story 1-1-login [Step 4/5: TEA test-review]
   │   └── ✅ Tests validated
   ├── 🔄 Story 1-1-login [Step 5/5: SM story-context]
   │   └── ✅ Created: stories/1-1-login.context.xml
   └── ✅ Story 1-1-login → ready-for-dev

   [... continues for remaining stories ...]

═══════════════════════════════════════════════════════════════════════

✅ Ralph Generate Complete!

Summary:
   • Epic 1: 3/3 stories prepared
   • Status: All stories now 'ready-for-dev'

Next: Run /bmad-ralph-execute to implement these stories
```
