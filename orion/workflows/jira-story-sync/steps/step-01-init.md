---
name: 'step-01-init'
description: 'Initialize workflow by loading configuration and validating Jira connection'

# Path Definitions
workflow_path: '{project-root}/orion/workflows/jira-story-sync'

# File References
thisStepFile: '{workflow_path}/steps/step-01-init.md'
nextStepFile: '{workflow_path}/steps/step-02-discover.md'
workflowFile: '{workflow_path}/workflow.md'

# Data References
statusMappingFile: '{workflow_path}/data/status-mapping.yaml'

# State Files
sidecarFile: '{project-root}/_bmad-output/jira-sync-state.yaml'
---

# Step 1: Initialize

## STEP GOAL:

To validate workflow configuration and ensure Jira connection is active before proceeding with story sync operations.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER proceed without valid configuration
- 📖 CRITICAL: Read the complete step file before taking any action
- 🔄 CRITICAL: When loading next step, ensure entire file is read
- 📋 Validate all prerequisites before continuing

### Role Reinforcement:

- ✅ You are a Jira Sync Specialist
- ✅ Efficient, action-oriented communication
- ✅ Clear error messages if validation fails
- ✅ Guide user to fix issues if detected

### Step-Specific Rules:

- 🎯 Focus ONLY on initialization and validation
- 🚫 FORBIDDEN to start sync operations in this step
- 💬 Report validation status clearly
- 🚪 STOP if critical validation fails

## EXECUTION PROTOCOLS:

- 🎯 Load and validate configuration
- 💾 Verify Jira connection via Rube MCP
- 📖 Auto-proceed to next step on success
- 🚫 HALT with clear error on failure

## CONTEXT BOUNDARIES:

- No previous context needed
- Focus ONLY on initialization
- Don't load stories or analyze in this step
- Validation must pass before continuing

## INITIALIZATION SEQUENCE:

### 1. Welcome and Configuration Check

Display:
```
🔄 **Jira Story Sync - Initializing**

Checking configuration...
```

### 2. Gather Configuration

Request or confirm these values from user context or prompt:

| Config | Required | Description |
|--------|----------|-------------|
| `project_key` | ✅ | Jira project key (e.g., ATF) |
| `user_email` | ✅ | Your email for Jira |
| `epic_id` | ✅ | Parent epic key (e.g., ATF-100) |
| `stories_path` | ✅ | Path to BMAD stories folder |

If any are missing, prompt the user:
"Please provide the following configuration:"

### 3. Validate Jira Connection

Call `RUBE_MANAGE_CONNECTIONS` with `toolkits: ["jira"]`:

- **If active**: Display "✅ Jira connection active"
- **If not active**: Display error with auth link, HALT workflow

### 4. Validate Project Access

Call `JIRA_GET_PROJECT` with `project_id_or_key: {project_key}`:

- **If success**: Display "✅ Project {project_key} accessible"
- **If error**: Display "❌ Cannot access project {project_key}. Check permissions.", HALT workflow

### 5. Validate Stories Path

Check if `{stories_path}` exists and contains `.md` files:

- **If valid**: Display "✅ Stories folder found: {count} markdown files"
- **If empty/missing**: Display "❌ No stories found at {stories_path}", HALT workflow

### 6. Load Status Mapping

Load `{statusMappingFile}` for BMAD ↔ Jira status translations.

Display "✅ Status mapping loaded"

### 7. Initialization Complete

Display:
```
✅ **Initialization Complete**

- Project: {project_key}
- Epic: {epic_id}
- Stories Path: {stories_path}
- Stories Found: {count}

Proceeding to discovery...
```

### 8. Auto-Proceed to Discovery

**Menu Handling Logic:**

- After successful initialization, immediately load, read entire file, then execute `{nextStepFile}`

**EXECUTION RULES:**

- This is an auto-proceed step after validation passes
- If validation fails, HALT and display actionable error
- Do not proceed until all validations pass

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- All configuration values present
- Jira connection active
- Project accessible
- Stories folder valid
- Status mapping loaded
- Auto-proceeded to step 2

### ❌ SYSTEM FAILURE:

- Missing configuration without prompting
- Proceeding despite failed validation
- Not checking Jira connection
- Skipping project validation

**Master Rule:** Do not proceed with sync if initialization fails. Provide clear, actionable error messages.

