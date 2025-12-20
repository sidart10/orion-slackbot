---
name: 'step-04-execute'
description: 'Execute the confirmed sync plan via Rube MCP Jira tools'

# Path Definitions
workflow_path: '{project-root}/orion/workflows/jira-story-sync'

# File References
thisStepFile: '{workflow_path}/steps/step-04-execute.md'
nextStepFile: '{workflow_path}/steps/step-05-complete.md'
workflowFile: '{workflow_path}/workflow.md'

# Data References
statusMappingFile: '{workflow_path}/data/status-mapping.yaml'
---

# Step 4: Execute Sync

## STEP GOAL:

To execute the confirmed sync plan by calling Jira APIs via Rube MCP, updating BMAD frontmatter, and tracking results.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER skip error handling
- 📖 CRITICAL: Read the complete step file before taking any action
- 🔄 CRITICAL: When loading next step, ensure entire file is read
- 📋 Track all results for reporting

### Role Reinforcement:

- ✅ You are a Jira Sync Specialist
- ✅ Execute operations systematically
- ✅ Provide progress feedback
- ✅ Handle errors gracefully

### Step-Specific Rules:

- 🎯 Execute sync operations from confirmed plan
- 🚫 FORBIDDEN to sync stories not in confirmed plan
- 💬 Show progress for each operation
- 🚪 Continue on individual failures, track for report

## EXECUTION PROTOCOLS:

- 🎯 Execute operations sequentially
- 💾 Update BMAD frontmatter after each successful sync
- 📖 Track results (success/failed/skipped)
- 🚫 Auto-proceed to completion step after all operations

## CONTEXT BOUNDARIES:

- Confirmed plan from step 3 is available
- Execute ONLY what was confirmed
- Update BMAD files with Jira keys
- Collect results for reporting

## EXECUTION SEQUENCE:

### 1. Begin Execution

Display:
```
⚡ **Executing Sync**

Processing {total} stories...
```

### 2. Process NEW Stories (Create in Jira)

For each story marked NEW:

**a. Parse Story Content:**
- Extract title from H1 heading
- Extract story text (As a.../I want.../So that...)
- Extract Acceptance Criteria section
- Format description for Jira (markdown to ADF-compatible)

**b. Create Jira Issue:**
Call `JIRA_CREATE_ISSUE` via Rube MCP:
```yaml
tool_slug: JIRA_CREATE_ISSUE
arguments:
  project_key: {project_key}
  summary: "{story_title}"
  description: "{formatted_description}"
  issue_type: "Story"
  # epic link handled separately if supported
```

**c. Handle Result:**
- **Success**: 
  - Display `[{n}/{total}] ✅ Created {filename} → {jira_key}`
  - Update BMAD frontmatter with `jira_key`, `jira_epic`, `last_synced`
  - Track in results as success
- **Failure**:
  - Display `[{n}/{total}] ❌ Failed {filename}: {error}`
  - Track in results as failed with error message
  - Continue with next story

### 3. Process MODIFIED Stories (Update in Jira)

For each story marked MODIFIED:

**a. Parse Story Content:**
- Extract current content
- Determine what changed (status, content, or both)

**b. Update Jira Issue:**

If content changed:
Call `JIRA_EDIT_ISSUE` via Rube MCP:
```yaml
tool_slug: JIRA_EDIT_ISSUE
arguments:
  issue_id_or_key: {jira_key}
  description: "{formatted_description}"
```

If status changed:
Call `JIRA_TRANSITION_ISSUE` via Rube MCP:
```yaml
tool_slug: JIRA_TRANSITION_ISSUE
arguments:
  issue_id_or_key: {jira_key}
  transition_id_or_name: "{target_status}"  # From status mapping
```

**c. Handle Result:**
- **Success**: 
  - Display `[{n}/{total}] ✅ Updated {filename} ({jira_key})`
  - Update BMAD frontmatter `last_synced`
  - Track in results as success
- **Failure**:
  - Display `[{n}/{total}] ❌ Failed {filename}: {error}`
  - Track in results as failed
  - Continue with next story

### 4. Process PULL_NEEDED Stories (Update BMAD from Jira)

For each story marked PULL_NEEDED:

**a. Get Jira Issue Status:**
Call `JIRA_GET_ISSUE` via Rube MCP:
```yaml
tool_slug: JIRA_GET_ISSUE
arguments:
  issue_key: {jira_key}
  fields: ["status"]
```

**b. Update BMAD Frontmatter:**
- Map Jira status to BMAD status using `{statusMappingFile}`
- Update story frontmatter with new `status` value
- Update `last_synced` timestamp

**c. Handle Result:**
- **Success**: 
  - Display `[{n}/{total}] ✅ Pulled {filename} — {jira_status} → {bmad_status}`
  - Track in results as success
- **Failure**:
  - Display `[{n}/{total}] ❌ Failed {filename}: {error}`
  - Track in results as failed
  - Continue with next story

### 5. Execution Summary

Display progress summary:
```
📊 **Execution Progress**

Processed: {processed}/{total}
✅ Success: {success_count}
❌ Failed: {failed_count}
```

### 6. Compile Results

Build results object for reporting:
```yaml
results:
  created:
    - file: "1-1-project-scaffolding.md"
      jira_key: "ATF-123"
      success: true
  updated:
    - file: "2-1-story.md"
      jira_key: "ATF-130"
      success: true
  pulled:
    - file: "3-1-story.md"
      jira_key: "ATF-140"
      old_status: "in-progress"
      new_status: "done"
      success: true
  failed:
    - file: "1-5-story.md"
      error: "Permission denied"
```

### 7. Auto-Proceed to Completion

**Menu Handling Logic:**

- After all operations complete, immediately load, read entire file, then execute `{nextStepFile}`
- Pass results to next step for reporting

**EXECUTION RULES:**

- This is an auto-proceed step after execution completes
- Carry results to step 5 for final report
- Do not halt for user input

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- All planned operations attempted
- BMAD frontmatter updated for successful syncs
- Progress displayed for each operation
- Results compiled for reporting
- Continued despite individual failures

### ❌ SYSTEM FAILURE:

- Syncing stories not in confirmed plan
- Stopping on first error (should continue)
- Not updating BMAD frontmatter
- Not tracking results

**Master Rule:** Execute systematically, handle errors gracefully, and track everything for the final report.

