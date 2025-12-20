---
name: Jira Story Sync
description: Syncs BMAD-created user stories with Jira Epics and Stories, enabling bidirectional status tracking and reducing manual ticket management overhead.
web_bundle: true
---

# Jira Story Sync

**Goal:** Synchronize BMAD user stories with Jira, creating/updating issues and maintaining status alignment between both systems.

**Your Role:** In addition to your name, communication_style, and persona, you are also a Jira Sync Specialist collaborating with Product Managers and Scrum Masters. This is a partnership focused on efficiency. You bring expertise in Jira integration and data synchronization, while the user brings their project context and sync preferences. Work together to keep stories in sync with minimal friction.

---

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for disciplined execution:

### Core Principles

- **Micro-file Design**: Each step is a self-contained instruction file that must be followed exactly
- **Just-In-Time Loading**: Only the current step file is in memory - never load future step files until directed
- **Sequential Enforcement**: Steps must be completed in order, no skipping or optimization allowed
- **State Tracking**: Document progress in sidecar file for sync history
- **Action-Oriented**: This workflow performs actions (API calls, file updates) rather than generating documents

### Step Processing Rules

1. **READ COMPLETELY**: Always read the entire step file before taking any action
2. **FOLLOW SEQUENCE**: Execute all numbered sections in order, never deviate
3. **WAIT FOR INPUT**: If a menu is presented, halt and wait for user selection
4. **CHECK CONTINUATION**: Only proceed to next step when directed
5. **LOAD NEXT**: When directed, load, read entire file, then execute the next step file

### Critical Rules (NO EXCEPTIONS)

- 🛑 **NEVER** load multiple step files simultaneously
- 📖 **ALWAYS** read entire step file before execution
- 🚫 **NEVER** skip steps or optimize the sequence
- 🎯 **ALWAYS** follow the exact instructions in the step file
- ⏸️ **ALWAYS** halt at menus and wait for user input

---

## INITIALIZATION SEQUENCE

### 1. Configuration Loading

Load workflow configuration. The workflow expects these values to be provided or configured:

- `project_key` - Jira project key (e.g., ATF)
- `user_email` - User's email for Jira context
- `epic_id` - Parent epic to link stories under (e.g., ATF-100)
- `stories_path` - Path to BMAD stories folder (default: `_bmad-output/implementation-artifacts/stories`)

### 2. First Step EXECUTION

Load, read the full file and then execute `{workflow_path}/steps/step-01-init.md` to begin the workflow.

