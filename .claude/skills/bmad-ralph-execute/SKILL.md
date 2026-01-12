---
name: bmad-ralph-execute
description: "Autonomous story implementation for BMAD projects. This skill should be used when the user wants to implement stories that are ready for development. It runs Steps 6-8 of the BMAD workflow (DEV develop-story, DEV code-review, DEV story-done) with fresh agent context per step. Requires stories in 'ready-for-dev' status from bmad-ralph-generate. Triggers epic retrospective when all stories in an epic are complete."
---

# BMAD Ralph Execute

Autonomous story implementation workflow that develops prepared stories to completion.

---

## ⚠️ CRITICAL EXECUTION RULE - READ THIS FIRST ⚠️

**YOU MUST SPAWN A NEW AGENT FOR EVERY SINGLE STEP.**

This is NON-NEGOTIABLE. The entire architecture depends on fresh context per step.

### What This Means:

```
❌ WRONG: Review code yourself inline
❌ WRONG: Mark story done yourself without spawning agent
❌ WRONG: Do step 7 or step 8 without Task tool

✅ CORRECT: Call Task tool for EVERY step (6, 7, 8)
✅ CORRECT: Each step = one Task() call = one fresh agent
✅ CORRECT: Never execute workflow logic yourself - always delegate
```

### Enforcement:

For EACH story, you must make these Task tool calls:
1. `Task(subagent_type="dev", description="DEV develop-story for {id}")` → Step 6
2. `Task(subagent_type="dev", description="DEV code-review for {id}")` → Step 7 ← **YES, SPAWN FOR REVIEW TOO**
3. `Task(subagent_type="dev", description="DEV story-done for {id}")` → Step 8 ← **YES, SPAWN FOR COMPLETION TOO**

And when epic completes:
4. `Task(subagent_type="sm", description="SM retrospective for Epic {n}")` → Retrospective

**DO NOT review code yourself. DO NOT mark stories done yourself. SPAWN AGENTS.**

---

## Overview

Ralph Execute runs Steps 6-8 of the BMAD test-first development workflow with **fresh agent context per step**. This prevents context degradation that occurs when implementing multiple stories in a single session.

**Key Innovation:** Each workflow step spawns a fresh Claude Code agent via the Task tool, maintaining consistent quality across unlimited story implementations.

## When to Use

- User has stories in `ready-for-dev` status (from `/bmad-ralph-generate`)
- User wants to implement stories
- User says things like "implement stories", "execute stories", "run ralph execute", "develop ready stories"

## Prerequisites

- `.ralph/config.yaml` must exist (created by `/bmad-ralph-generate`)
- Stories must be in `ready-for-dev` status
- Story context.xml files must exist

## Workflow Steps

| Step | Agent | Workflow | Output |
|------|-------|----------|--------|
| 6 | DEV | develop-story | Code implemented, tests written |
| 7 | DEV | code-review | Code reviewed, issues fixed |
| 8 | DEV | story-done | Final validation, status = done |

**Status Transitions:** `ready-for-dev` → `in-progress` → `review` → `done`

## Execution Flow

### Phase 1: Load Configuration

1. **Check for existing config:**
   ```
   📂 Loading config from .ralph/config.yaml...
   ```

   If config doesn't exist, show error and exit:
   ```
   ❌ No configuration found. Run /bmad-ralph-generate first.
   ```

2. **Load configuration and validate paths**

### Phase 2: Story Selection

1. **Parse sprint-status.yaml** for stories in `ready-for-dev` status
2. **Display available stories:**
   ```
   📋 Stories Ready for Development:
      1. 1-1-login-endpoint (Epic 1) - ready-for-dev
      2. 1-2-logout-endpoint (Epic 1) - ready-for-dev
      3. 2-1-profile-view (Epic 2) - ready-for-dev
   ```

3. **If no stories ready:**
   ```
   ℹ️  No stories in 'ready-for-dev' status.
   Run /bmad-ralph-generate first to prepare stories.
   ```

4. **Prompt for story count:**
   ```
   ❓ How many stories would you like to execute? (1-3 or 'all'):
   ```

5. **Show execution plan and confirm:**
   ```
   📊 Execution Plan:
      • Stories: 3 (1-1, 1-2, 2-1)
      • Steps per story: 3

      Proceed? (y/n):
   ```

### Phase 3: Story Loop Execution

For each selected story:

1. **Load story context** from `{story_id}.context.xml`
2. **Execute Steps 6-8** by spawning fresh DEV agents
3. **Verify outputs** after each step
4. **Update sprint-status.yaml** on status transitions
5. **Check for epic completion** after each story

### Phase 4: Epic Retrospective

When a story reaches `done` status, check if all stories in its epic are also `done`:

1. **Check epic completion:**
   - All stories in epic have status `done`
   - Retrospective file doesn't already exist

2. **If complete, spawn SM for retrospective:**
   - Creates `{impl_dir}/retrospectives/epic-{n}-retrospective.md`
   - Reviews epic outcomes, lessons learned, patterns

## Agent Spawning

**EVERY STEP requires a Task tool call.** No exceptions. No inline execution.

Use the Task tool to spawn fresh agent instances. Each agent runs in **autonomous mode**.

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
   - `{impl_dir}` - Path to implementation artifacts
   - `{workflow_path}` - Relative path to workflow.yaml

3. **Combine and spawn:**
   ```python
   # Read prompt templates
   base_template = read_file("prompts/autonomous_base.txt")
   step_template = read_file("prompts/step_6_develop_story.txt")

   # Combine and substitute
   full_prompt = base_template.format(**context_vars) + "\n\n" + step_template.format(**context_vars)

   # Spawn agent
   Task(
       subagent_type="dev",
       description="DEV develop-story for story-1-1-login",
       prompt=full_prompt
   )
   ```

**Workflow Paths (referenced in prompts):**

| Step | Agent | Workflow Path |
|------|-------|---------------|
| 6 | `dev` | `_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml` |
| 7 | `dev` | `_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml` |
| 8 | `dev` | `_bmad/bmm/workflows/4-implementation/story-done/workflow.yaml` |
| Retro | `sm` | `_bmad/bmm/workflows/4-implementation/retrospective/workflow.yaml` |

**Execution Flow:**

For EACH story, spawn agents SEQUENTIALLY (wait for each to complete):

1. Task(subagent_type="dev", ...) → Step 6: Develop story
2. Task(subagent_type="dev", ...) → Step 7: Code review
3. Task(subagent_type="dev", ...) → Step 8: Story done
4. Task(subagent_type="sm", ...) → Retrospective (if epic complete)

**CRITICAL:** DO NOT skip Task tool calls. DO NOT execute workflows inline. Each step = one Task() spawn.

## Resume Logic

Ralph can resume from partial completion:

| Status | Resume From |
|--------|-------------|
| `ready-for-dev` | Step 6 |
| `in-progress` | Step 6 (may have partial implementation) |
| `review` | Step 8 |
| `done` | Skip (already complete) |

## Error Handling

| Error Type | Action |
|------------|--------|
| AGENT_CRASH | Stop, log details, prompt user to fix |
| OUTPUT_MISSING | Stop, show missing file |
| TEST_FAILURE | Stop, show failing tests |
| BUILD_FAILURE | Stop, show build errors |
| STATUS_UPDATE_FAILED | Stop, check permissions |

On any error:
1. Log to `logs/ralph-execute-{timestamp}.log`
2. Display user-friendly error message
3. Exit cleanly - status remains at last successful state
4. User fixes issue and re-runs skill to resume

## Progress Display

Show real-time progress during execution:

```
🔄 Executing Story 1-1-login-endpoint...
   ├── 🔄 [Step 6/8: DEV develop-story]
   │   └── ✅ Code implemented, tests written
   ├── 🔄 [Step 7/8: DEV code-review]
   │   └── ✅ Code reviewed, 3 issues fixed
   ├── 🔄 [Step 8/8: DEV story-done]
   │   └── ✅ All tests passing, story complete
   └── ✅ Story 1-1-login-endpoint → done
```

## Retrospective Trigger

After each story completion:

```python
def check_epic_completion(epic_id, stories):
    # All stories in this epic done?
    epic_stories = [s for s in stories if s.epic_id == epic_id]
    all_done = all(s.status == 'done' for s in epic_stories)

    # Retrospective doesn't already exist?
    retro_path = f"{impl_dir}/retrospectives/epic-{epic_id}-retrospective.md"
    retro_exists = os.path.exists(retro_path)

    if all_done and not retro_exists:
        trigger_retrospective(epic_id)
```

## Scripts

This skill uses helper scripts in `scripts/`:

- **config.py** - Configuration loading and validation
- **sprint_parser.py** - Parse sprint-status.yaml, extract stories
- **step_executor.py** - Execute single step via Task tool
- **prompt_builder.py** - Build autonomous prompts for DEV agent
- **progress.py** - Progress display utilities
- **error_handler.py** - Error categorization and messages
- **logger.py** - Logging with rotation
- **utils.py** - File locking, path utilities
- **retrospective.py** - Epic completion detection and retro trigger

## Prompts

Step-specific prompt templates in `prompts/`:

- `autonomous_base.txt` - Base template for DEV agent
- `step_6_develop_story.txt` - DEV develop-story specific
- `step_7_code_review.txt` - DEV code-review specific
- `step_8_story_done.txt` - DEV story-done specific
- `retrospective.txt` - SM retrospective specific

## Configuration Files

Uses the same `.ralph/config.yaml` created by generate skill:

```yaml
planning_dir: "./planning-artifacts"
impl_dir: "./implementation-artifacts"
use_tea_agent: true  # Affects context.xml format

step_timeouts:
  6: 30   # develop-story (minutes)
  7: 20   # code-review
  8: 5    # story-done
```

## Complete Execution Example

```
╔════════════════════════════════════════════════════════════════════╗
║  🚀 BMAD Ralph Execute - Development Workflow                       ║
╚════════════════════════════════════════════════════════════════════╝

📂 Loading config from .ralph/config.yaml...
   ✅ Planning: ./planning-artifacts
   ✅ Implementation: ./implementation-artifacts

📋 Stories Ready for Development:
   1. 1-1-login-endpoint (Epic 1) - ready-for-dev
   2. 1-2-logout-endpoint (Epic 1) - ready-for-dev
   3. 1-3-session-management (Epic 1) - ready-for-dev

❓ How many stories would you like to execute? (1-3 or 'all'): all

═══════════════════════════════════════════════════════════════════════

📊 Execution Plan:
   • Stories: 3 (1-1, 1-2, 1-3)
   • Steps per story: 3

   Proceed? (y/n): y

═══════════════════════════════════════════════════════════════════════

🔄 Executing Story 1-1-login-endpoint...
   ├── 🔄 [Step 6/8: DEV develop-story]
   │   └── ✅ Code implemented, tests written
   ├── 🔄 [Step 7/8: DEV code-review]
   │   └── ✅ Code reviewed, issues fixed
   ├── 🔄 [Step 8/8: DEV story-done]
   │   └── ✅ All tests passing, story complete
   └── ✅ Story 1-1-login-endpoint → done

🔄 Executing Story 1-2-logout-endpoint...
   [... similar output ...]
   └── ✅ Story 1-2-logout-endpoint → done

🔄 Executing Story 1-3-session-management...
   [... similar output ...]
   └── ✅ Story 1-3-session-management → done

🎉 Epic 1 Complete! Generating retrospective...
   └── ✅ Created: retrospectives/epic-1-retrospective.md

═══════════════════════════════════════════════════════════════════════

✅ Ralph Execute Complete!

Summary:
   • Stories implemented: 3/3
   • Epic 1: Complete with retrospective
   • All stories now 'done'

Great work! 🚀
```
