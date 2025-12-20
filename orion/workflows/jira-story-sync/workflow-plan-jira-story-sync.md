---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
status: COMPLETE
completionDate: 2025-12-19
---

# Workflow Creation Plan: jira-story-sync

## Initial Project Context

- **Module:** BMM (BMAD Method)
- **Target Location:** orion/workflows/jira-story-sync/
- **Created:** 2025-12-19
- **Primary Users:** Product Managers, Scrum Masters

## Problem Statement

BMAD creates well-structured user stories through its workflows, but these stories live separately from the team's Jira project. This creates:
- Manual effort to copy/paste stories into Jira
- Communication bottlenecks between planning and execution
- Risk of stories getting out of sync between BMAD docs and Jira
- Time lost on administrative ticket management

## Solution Overview

A workflow that bridges BMAD story creation with Jira, enabling:
- Automatic or guided sync of stories to Jira Epics/Stories
- Bidirectional awareness (BMAD knows what's in Jira, Jira reflects BMAD content)
- Reduced manual overhead for PMs and SMs
- Single source of truth maintenance

---

## Requirements (Gathered in Step 2)

### Source & Format

| Attribute | Value |
|-----------|-------|
| **Source Location** | `_bmad-output/implementation-artifacts/stories/` |
| **File Format** | Markdown with frontmatter |
| **Story Structure** | Status field, Story section (As a/I want/So that), Acceptance Criteria, Tasks/Subtasks, Dev Notes, References |
| **Naming Convention** | `{epic#}-{story#}-{slug}.md` (e.g., `1-1-project-scaffolding.md`) |

### Sync Specifications

| Requirement | Details |
|-------------|---------|
| **Direction** | Primary: BMAD → Jira; Secondary: Jira → BMAD (status sync) |
| **Epic Handling** | Link stories to existing Jira Epic by Epic ID |
| **Story Handling** | Create new Jira Stories OR update existing by Story ID |
| **Status Mapping** | BMAD `Status: done/in-progress/todo` ↔ Jira workflow states |
| **Duplicate Prevention** | Track synced stories to avoid re-creation |

### Workflow Type

| Characteristic | Value |
|----------------|-------|
| **Type** | Hybrid: Interactive + Autonomous |
| **Interactive Mode** | Guided selection of which stories to sync |
| **Autonomous Mode** | Batch sync all stories in folder |
| **Trigger** | Cursor slash command / cursor rule |

### User Configuration Required

| Config Item | Purpose |
|-------------|---------|
| **Jira Project Key** | Target project for issues (e.g., `ATF`) |
| **User Email** | For Jira API authentication context |
| **Epic ID** | Parent epic to link stories under |
| **Stories Folder Path** | Location of BMAD story files |

### Tool Integration (Rube MCP)

| Tool Slug | Purpose in Workflow |
|-----------|---------------------|
| `JIRA_CREATE_ISSUE` | Create new stories in Jira |
| `JIRA_EDIT_ISSUE` | Update existing Jira issues |
| `JIRA_GET_ISSUE` | Fetch issue details for sync comparison |
| `JIRA_SEARCH_ISSUES` | Find existing issues, check duplicates |
| `JIRA_TRANSITION_ISSUE` | Sync status changes |
| `JIRA_ADD_COMMENT` | Add sync notes/updates |
| `JIRA_GET_PROJECT` | Validate project access |
| `JIRA_GET_TRANSITIONS` | Get available status transitions |
| `JIRA_GET_ISSUE_TYPES` | Verify Story issue type available |

### Workflow Capabilities

1. **Push Story to Jira** — Create new Jira Story from BMAD file
2. **Update Story in Jira** — Push content changes to existing issue
3. **Sync Status BMAD → Jira** — Transition Jira issue based on BMAD status
4. **Sync Status Jira → BMAD** — Update BMAD frontmatter from Jira status
5. **Batch Sync** — Process all stories in folder
6. **Selective Sync** — User chooses which stories to sync
7. **Sync Report** — Summary of what was synced/skipped/failed

### Success Criteria

- Stories created in Jira match BMAD content (summary, description, ACs)
- Status changes in either system can be reflected in the other
- No duplicate issues created
- Clear feedback on sync results
- Minimal manual intervention for routine syncs

### Output Specifications

| Output | Format |
|--------|--------|
| **Jira Issues** | Created/updated in target project |
| **Sync Log** | Markdown file with sync results |
| **Updated BMAD Files** | Frontmatter updated with Jira issue keys |

---

## Tools Configuration (Step 3)

### Core BMAD Tools

| Tool | Included | Rationale |
|------|----------|-----------|
| **Party-Mode** | ❌ Excluded | Workflow is procedural, not creative |
| **Advanced Elicitation** | ❌ Excluded | Requirements are straightforward |
| **Brainstorming** | ❌ Excluded | Execution-focused workflow |

### LLM Features

| Feature | Included | Purpose |
|---------|----------|---------|
| **File I/O** | ✅ Yes | Read BMAD story files, update frontmatter with Jira keys |
| **Web-Browsing** | ❌ No | All data is local + Jira API |
| **Sub-Agents** | ❌ No | Rube MCP handles parallel operations |
| **Sub-Processes** | ❌ No | Rube MCP handles parallel operations |

### Memory Systems

| System | Included | Purpose |
|--------|----------|---------|
| **Sidecar File** | ✅ Yes | Track sync history: which stories synced, Jira keys, timestamps |

**Sidecar File Schema:**
```yaml
# jira-story-sync-state.yaml
last_sync: 2025-12-19T10:30:00Z
project_key: ATF
synced_stories:
  - bmad_file: "1-1-project-scaffolding.md"
    jira_key: ATF-123
    last_synced: 2025-12-19T10:30:00Z
    bmad_status: done
    jira_status: Done
```

### External Integrations (Rube MCP)

| Tool | Purpose |
|------|---------|
| `RUBE_MANAGE_CONNECTIONS` | Verify Jira connection active |
| `RUBE_GET_TOOL_SCHEMAS` | Get Jira tool input schemas |
| `RUBE_MULTI_EXECUTE_TOOL` | Batch Jira operations |
| `RUBE_REMOTE_WORKBENCH` | Complex processing, data transformation |
| `JIRA_*` tools | All Jira operations (see Requirements section) |

### Installation Requirements

| Item | Required | Status |
|------|----------|--------|
| Rube MCP Server | Yes | Already configured |
| Jira Connection | Yes | Active (verified in Step 2) |
| Additional Installs | None | — |

---

## Design Notes

### Story-to-Jira Field Mapping

| BMAD Story Element | Jira Field |
|--------------------|------------|
| Story title (H1) | Summary |
| Story section (As a.../I want.../So that...) | Description (formatted) |
| Acceptance Criteria | Description (appended) |
| Status frontmatter | Workflow transition |
| Epic ID (config) | Parent link |
| Tasks section | Could become subtasks (optional) |

### Frontmatter Enhancements Needed

```yaml
---
status: done
jira_key: ATF-123        # Added after sync
jira_epic: ATF-100       # Parent epic
last_synced: 2025-12-19  # Sync timestamp
---
```

### Processing Flow

1. **Initialize** → Load config (project key, email, epic ID, stories path)
2. **Discover** → Scan stories folder, load sidecar state
3. **Analyze** → Compare BMAD files vs sidecar (new, modified, unchanged)
4. **Present** → Show user what will be synced (interactive mode)
5. **Execute** → Create/update Jira issues via Rube MCP
6. **Update** → Write Jira keys to BMAD frontmatter
7. **Record** → Update sidecar file with sync state
8. **Report** → Summary of actions taken

---

## Output Format Design (Step 5)

### Format Types

| Output | Format Type | File Format |
|--------|-------------|-------------|
| **Sync Report** | Structured | Markdown |
| **BMAD Frontmatter** | Strict | YAML |
| **Sidecar State** | Semi-structured | YAML |

### 1. Sync Report Template

**File:** `_bmad-output/sync-reports/jira-sync-{timestamp}.md`

```markdown
# Jira Sync Report

**Date:** {timestamp}  
**Project:** {project_key}  
**Epic:** {epic_id}  

## Summary

| Action | Count |
|--------|-------|
| Created | {count} |
| Updated | {count} |
| Skipped | {count} |
| Failed | {count} |

## Details

### Created
- `{filename}` → {jira_key}

### Updated  
- `{filename}` ({jira_key}) — status: {old} → {new}

### Skipped
- `{filename}` — {reason}

### Errors
- `{filename}` — {error_message}
```

### 2. BMAD Frontmatter Schema

**Fields added to story files after sync:**

```yaml
---
status: done              # Existing field
jira_key: ATF-123         # Jira issue key (added)
jira_epic: ATF-100        # Parent epic key (added)
last_synced: 2025-12-19T10:30:00Z  # ISO timestamp (added)
---
```

### 3. Sidecar State File Schema

**File:** `_bmad-output/jira-sync-state.yaml`

```yaml
# Jira Story Sync State
# Tracks sync history for duplicate prevention and status comparison

last_sync: 2025-12-19T10:30:00Z
project_key: ATF
default_epic: ATF-100
user_email: user@example.com
stories_path: _bmad-output/implementation-artifacts/stories

synced_stories:
  - file: "1-1-project-scaffolding.md"
    jira_key: ATF-123
    last_synced: 2025-12-19T10:30:00Z
    bmad_status: done
    jira_status: Done
    content_hash: "abc123..."  # For detecting content changes
```

---

## Workflow Structure Design (Step 6)

### Continuation Support

**Required:** No  
**Rationale:** Single-session workflow with quick API operations

### Step Sequence

| Step | File | Purpose | Menu Type |
|------|------|---------|-----------|
| 1 | `step-01-init.md` | Load config, verify Jira connection | Auto-proceed |
| 2 | `step-02-discover.md` | Scan stories, load sidecar, analyze | Auto-proceed |
| 3 | `step-03-plan.md` | Present sync plan, user confirms | Interactive |
| 4 | `step-04-execute.md` | Execute sync via Rube MCP | Progress display |
| 5 | `step-05-complete.md` | Generate report, update state | Done |

### Step 1: Initialize

**Goal:** Validate configuration and Jira connection

**Actions:**
- Load workflow config (project_key, email, epic_id, stories_path)
- Call `RUBE_MANAGE_CONNECTIONS` to verify Jira active
- Call `JIRA_GET_PROJECT` to validate project access
- If validation fails → Error with guidance
- If success → Auto-proceed to step 2

**Outputs:** Validated config in memory

### Step 2: Discover & Analyze

**Goal:** Build the sync plan by analyzing stories

**Actions:**
- Scan stories folder for `*.md` files
- Load sidecar state file (if exists)
- Parse each story file's frontmatter
- Categorize stories:
  - `NEW`: No `jira_key` in frontmatter
  - `MODIFIED`: Has `jira_key` but content/status changed
  - `UNCHANGED`: Matches sidecar state exactly
  - `PULL_NEEDED`: Jira status differs from BMAD status
- Auto-proceed to step 3 with analysis results

**Outputs:** Categorized story list with sync actions

### Step 3: Present Plan

**Goal:** User reviews and confirms sync actions

**Display:**
```
## Sync Plan Summary

| Action | Count | Stories |
|--------|-------|---------|
| Create | 5 | 1-1, 1-2, 1-3, 1-4, 1-5 |
| Update | 3 | 2-1, 2-2, 2-3 |
| Skip | 10 | (no changes) |
| Pull Status | 2 | 3-1, 3-2 |
```

**Menu:**
- `[S]` Sync All — Execute full plan as shown
- `[P]` Pick Stories — Select specific stories interactively
- `[X]` Exclude — Remove specific stories from plan
- `[C]` Continue — Execute with current plan

### Step 4: Execute

**Goal:** Perform sync operations via Rube MCP

**Actions:**
For each story in confirmed plan:
- `NEW`: Call `JIRA_CREATE_ISSUE` → Update BMAD frontmatter with `jira_key`
- `MODIFIED`: Call `JIRA_EDIT_ISSUE` → Update Jira with BMAD content
- `PULL`: Call `JIRA_GET_ISSUE` → Update BMAD frontmatter status

**Progress Display:**
```
Syncing stories...
[1/8] Creating 1-1-project-scaffolding.md → ATF-123 ✓
[2/8] Creating 1-2-langfuse-instrumentation.md → ATF-124 ✓
[3/8] Updating 2-1-claude-agent-sdk.md (ATF-130) ✓
...
```

**Outputs:** Sync results (success/failed/skipped per story)

### Step 5: Complete

**Goal:** Finalize workflow and report results

**Actions:**
- Generate sync report markdown file
- Update sidecar state file with all synced stories
- Display completion summary

**Display:**
```
## Sync Complete!

✅ Created: 5 stories
✅ Updated: 3 stories  
⏭️ Skipped: 10 stories
❌ Failed: 0 stories

Report saved: _bmad-output/sync-reports/jira-sync-2025-12-19T10-30-00.md
```

### Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Config    │     │   Stories   │     │   Sidecar   │
│   (yaml)    │     │   Folder    │     │   State     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                 ┌─────────────────┐
                 │  Step 1: Init   │
                 │  (validate)     │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Step 2: Discover│
                 │ (analyze)       │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │  Step 3: Plan   │◄──── User Input
                 │  (confirm)      │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Step 4: Execute │────► Jira API
                 │ (sync)          │      (via Rube)
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Step 5: Complete│────► Report
                 │ (finalize)      │────► Sidecar
                 └─────────────────┘────► BMAD Files
```

### File Structure

```
orion/workflows/jira-story-sync/
├── workflow.md                           # Entry point
├── workflow-plan-jira-story-sync.md      # This plan document
├── steps/
│   ├── step-01-init.md
│   ├── step-02-discover.md
│   ├── step-03-plan.md
│   ├── step-04-execute.md
│   └── step-05-complete.md
└── data/
    └── status-mapping.yaml               # BMAD ↔ Jira status mapping
```

### AI Role & Persona

**Role:** Jira Sync Specialist  
**Expertise:** Jira integration, data synchronization, status management  
**Tone:** Efficient, action-oriented, clear progress feedback  
**Style:** Status updates, progress indicators, concise summaries

### Error Handling

| Error Type | Handling |
|------------|----------|
| Jira connection failed | Display error, suggest checking Rube connection |
| Project access denied | Display error, verify project key |
| Story parsing failed | Skip story, log error, continue with others |
| Jira API error | Log error, mark story as failed, continue |
| Rate limiting | Pause, retry with backoff |

### Status Mapping (data/status-mapping.yaml)

```yaml
# BMAD Status → Jira Transition
bmad_to_jira:
  todo: "To Do"
  in-progress: "In Progress"
  done: "Done"

# Jira Status → BMAD Status
jira_to_bmad:
  "To Do": todo
  "In Progress": in-progress
  "In Review": in-progress
  "Done": done
  "Closed": done
```

---

## Build Summary (Step 7)

### Files Generated

| File | Path | Purpose |
|------|------|---------|
| `workflow.md` | `orion/workflows/jira-story-sync/workflow.md` | Main entry point |
| `step-01-init.md` | `orion/workflows/jira-story-sync/steps/step-01-init.md` | Initialize & validate |
| `step-02-discover.md` | `orion/workflows/jira-story-sync/steps/step-02-discover.md` | Scan & analyze stories |
| `step-03-plan.md` | `orion/workflows/jira-story-sync/steps/step-03-plan.md` | Present plan, get confirmation |
| `step-04-execute.md` | `orion/workflows/jira-story-sync/steps/step-04-execute.md` | Execute sync operations |
| `step-05-complete.md` | `orion/workflows/jira-story-sync/steps/step-05-complete.md` | Generate report, finalize |
| `status-mapping.yaml` | `orion/workflows/jira-story-sync/data/status-mapping.yaml` | Status translation table |

### Build Date

**Generated:** 2025-12-19

### Template Customizations

- Based on BMAD step-template.md structure
- No continuation support (single-session workflow)
- Interactive menu in step-03-plan.md only
- Auto-proceed for steps 1, 2, 4
- Rube MCP integration for all Jira operations

### Next Steps

1. **Review** — Check generated files for accuracy
2. **Test** — Run workflow with a small set of stories
3. **Install** — Create Cursor rule/command for easy invocation
4. **Iterate** — Refine based on usage feedback

---

## Review Summary (Step 8)

### Validation Results

| Category | Result |
|----------|--------|
| Configuration | ✅ PASSED |
| Step Compliance | ✅ PASSED |
| Cross-file Consistency | ✅ PASSED |
| Requirements | ✅ PASSED |
| Best Practices | ✅ PASSED |

### Issues Found

None critical. Workflow is ready for use.

---

## Completion Summary (Step 9)

### Status

**✅ WORKFLOW CREATION COMPLETE**

### Workflow Details

| Field | Value |
|-------|-------|
| **Name** | jira-story-sync |
| **Module** | BMM (BMAD Method) |
| **Location** | `orion/workflows/jira-story-sync/` |
| **Created** | 2025-12-19 |
| **Files** | 7 (workflow.md + 5 steps + data file) |

### Quick Start

1. Ensure Rube MCP is connected with Jira
2. Have your Project Key, Email, and Epic ID ready
3. Invoke the workflow via Cursor rule or direct reference
4. Follow the interactive prompts

### Compliance Check

To validate against BMAD standards, run in a new context:
```
/bmad:bmm:workflows:workflow-compliance-check
```
Provide path: `orion/workflows/jira-story-sync/workflow.md`
