---
name: 'step-02-discover'
description: 'Scan stories folder, load sidecar state, and analyze what needs to be synced'

# Path Definitions
workflow_path: '{project-root}/orion/workflows/jira-story-sync'

# File References
thisStepFile: '{workflow_path}/steps/step-02-discover.md'
nextStepFile: '{workflow_path}/steps/step-03-plan.md'
workflowFile: '{workflow_path}/workflow.md'

# Data References
statusMappingFile: '{workflow_path}/data/status-mapping.yaml'

# State Files
sidecarFile: '{project-root}/_bmad-output/jira-sync-state.yaml'
---

# Step 2: Discover & Analyze

## STEP GOAL:

To scan the stories folder, load existing sync state, and categorize each story by what sync action is needed.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER modify files in this step
- 📖 CRITICAL: Read the complete step file before taking any action
- 🔄 CRITICAL: When loading next step, ensure entire file is read
- 📋 Analysis only - no sync actions

### Role Reinforcement:

- ✅ You are a Jira Sync Specialist
- ✅ If you already have been given a name, communication_style and persona, continue to use those while playing this new role
- ✅ We engage in collaborative dialogue, not command-response
- ✅ You bring Jira integration expertise, user brings project context
- ✅ Maintain efficient, action-oriented tone throughout
- ✅ Thorough analysis before action
- ✅ Clear categorization of stories
- ✅ Accurate change detection

### Step-Specific Rules:

- 🎯 Focus ONLY on discovery and analysis
- 🚫 FORBIDDEN to create/update Jira issues in this step
- 🚫 FORBIDDEN to modify any files in this step
- 💬 Build complete picture before presenting plan

## EXECUTION PROTOCOLS:

- 🎯 Scan all story files in configured path
- 💾 Load sidecar state if exists
- 📖 Categorize each story by action needed
- 🚫 Auto-proceed to plan step with results

## CONTEXT BOUNDARIES:

- Configuration from step 1 is available
- Focus ONLY on analysis
- Don't execute any sync operations
- Build categorized list for step 3

## DISCOVERY SEQUENCE:

### 1. Begin Discovery

Display:
```
🔍 **Discovering Stories**

Scanning {stories_path}...
```

### 2. Load Sidecar State

Check if `{sidecarFile}` exists:

**If exists:**
- Load the YAML file
- Extract `synced_stories` array
- Display "📋 Loaded sync history: {count} previously synced stories"

**If not exists:**
- Initialize empty sync history
- Display "📋 No previous sync history found (first sync)"

### 3. Scan Stories Folder

Read all `.md` files from `{stories_path}`:

For each file:
1. Parse frontmatter (extract `status`, `jira_key`, `jira_epic`, `last_synced`)
2. Extract story title from first H1 heading
3. Parse filename for epic/story numbers (e.g., `1-1-project-scaffolding.md`)

### 4. Categorize Stories

For each story, determine sync action:

**NEW** - Story needs to be created in Jira:
- No `jira_key` in frontmatter
- Not found in sidecar history

**MODIFIED** - Story needs to be updated in Jira:
- Has `jira_key` in frontmatter
- Content or status differs from last sync
- (Compare using content hash or status field)

**UNCHANGED** - No sync needed:
- Has `jira_key` in frontmatter
- Matches sidecar state exactly
- No changes detected

**PULL_NEEDED** - Jira status should update BMAD:
- Has `jira_key` in frontmatter
- Jira issue status differs from BMAD status
- (Requires checking Jira - optional optimization: batch this)

### 5. Build Analysis Summary

Create structured analysis:

```yaml
analysis:
  total_stories: {count}
  new: [{list of filenames}]
  modified: [{list of filenames}]
  unchanged: [{list of filenames}]
  pull_needed: [{list of filenames}]
```

### 6. Display Discovery Results

Display:
```
📊 **Discovery Complete**

| Category | Count |
|----------|-------|
| New (create in Jira) | {count} |
| Modified (update Jira) | {count} |
| Unchanged (skip) | {count} |
| Pull Status (update BMAD) | {count} |
| **Total** | {total} |

Proceeding to sync plan...
```

### 7. Auto-Proceed to Plan

**Menu Handling Logic:**

- After analysis complete, immediately load, read entire file, then execute `{nextStepFile}`
- Pass analysis results to next step

**EXECUTION RULES:**

- This is an auto-proceed step after analysis completes
- Carry analysis results to step 3
- Do not halt for user input

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- All stories in folder scanned
- Sidecar state loaded (or initialized if first run)
- Each story categorized correctly
- Analysis summary generated
- Auto-proceeded to step 3

### ❌ SYSTEM FAILURE:

- Skipping stories during scan
- Not loading sidecar state
- Incorrect categorization
- Modifying files during analysis

**Master Rule:** This step is read-only. Analyze completely before presenting the sync plan.

