---
name: 'step-03-plan'
description: 'Present sync plan to user and get confirmation before executing'

# Path Definitions
workflow_path: '{project-root}/orion/workflows/jira-story-sync'

# File References
thisStepFile: '{workflow_path}/steps/step-03-plan.md'
nextStepFile: '{workflow_path}/steps/step-04-execute.md'
workflowFile: '{workflow_path}/workflow.md'
---

# Step 3: Sync Plan

## STEP GOAL:

To present the sync plan to the user, allow modifications, and get confirmation before executing sync operations.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER execute sync without user confirmation
- 📖 CRITICAL: Read the complete step file before taking any action
- 🔄 CRITICAL: When loading next step with 'C', ensure entire file is read
- 📋 User must approve the plan before execution

### Role Reinforcement:

- ✅ You are a Jira Sync Specialist
- ✅ Clear presentation of what will happen
- ✅ Allow user to modify the plan
- ✅ Confirm before executing

### Step-Specific Rules:

- 🎯 Focus ONLY on plan presentation and confirmation
- 🚫 FORBIDDEN to execute sync operations in this step
- 💬 Present clear, actionable options
- 🚪 Get explicit user approval before continuing

## EXECUTION PROTOCOLS:

- 🎯 Present complete sync plan
- 💾 Allow user to modify selections
- 📖 Proceed only when user selects 'C'
- 🚫 HALT and wait for user input at menu

## CONTEXT BOUNDARIES:

- Analysis results from step 2 are available
- Focus ONLY on plan review and confirmation
- Don't execute any sync operations
- Build final plan for step 4

## PLAN PRESENTATION SEQUENCE:

### 1. Present Sync Plan

Display the sync plan based on analysis from step 2:

```
📋 **Sync Plan**

**Project:** {project_key}
**Epic:** {epic_id}

## Actions to Execute

### 🆕 Create in Jira ({count})
{For each NEW story:}
- [ ] `{filename}` — "{story_title}"

### 📝 Update in Jira ({count})
{For each MODIFIED story:}
- [ ] `{filename}` ({jira_key}) — {change_description}

### ⬇️ Pull Status from Jira ({count})
{For each PULL_NEEDED story:}
- [ ] `{filename}` ({jira_key}) — Jira: {jira_status} → BMAD

### ⏭️ Skip (No Changes) ({count})
{count} stories unchanged, will be skipped.
```

### 2. Present Menu Options

Display: **Select an Option:**

```
[S] Sync All — Execute the full plan as shown
[P] Pick Stories — Select specific stories to sync
[X] Exclude — Remove specific stories from plan
[V] View Details — See full details for a story
[C] Continue — Execute with current plan
```

### 3. Handle Menu Selection

#### IF S (Sync All):
- Confirm all stories in plan are selected
- Display "All {count} stories will be synced"
- Redisplay menu

#### IF P (Pick Stories):
- Display numbered list of all stories with actions
- Ask "Enter story numbers to include (comma-separated, e.g., 1,3,5):"
- Update plan to only include selected stories
- Display updated plan summary
- Redisplay menu

#### IF X (Exclude):
- Display numbered list of stories currently in plan
- Ask "Enter story numbers to exclude (comma-separated):"
- Remove selected stories from plan
- Display updated plan summary
- Redisplay menu

#### IF V (View Details):
- Ask "Enter filename to view:"
- Display full story details:
  - Current BMAD status
  - Jira key (if exists)
  - Last sync date (if exists)
  - Proposed action
  - Content preview
- Redisplay menu

#### IF C (Continue):
- Confirm final plan
- Display:
  ```
  **Proceeding with sync:**
  - Create: {count} stories
  - Update: {count} stories
  - Pull: {count} stories
  - Skip: {count} stories
  ```
- Load, read entire file, then execute `{nextStepFile}`

#### IF Any other input:
- Respond to user query
- Redisplay menu

### 4. Menu Handling Logic

- IF S: Mark all for sync, redisplay menu
- IF P: Interactive selection, update plan, redisplay menu
- IF X: Interactive exclusion, update plan, redisplay menu
- IF V: Show story details, redisplay menu
- IF C: Finalize plan, proceed to `{nextStepFile}`
- IF other: Respond and redisplay menu

### EXECUTION RULES:

- ALWAYS halt and wait for user input after presenting menu
- ONLY proceed to next step when user selects 'C'
- After other menu items, return to this menu
- User can chat or ask questions - respond then redisplay menu

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- Plan presented clearly with all categories
- User able to modify selections
- Explicit confirmation received (C selected)
- Final plan ready for execution

### ❌ SYSTEM FAILURE:

- Executing sync without user confirmation
- Not allowing plan modifications
- Proceeding without 'C' selection
- Unclear presentation of actions

**Master Rule:** Never execute sync operations without explicit user confirmation. This is the user's last chance to review before changes are made.

