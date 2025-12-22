# Story 7.1: Skills Framework Infrastructure

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: SDK auto-discovers .claude/skills/ directory

## Story

As a **developer**, I want a framework for defining Skills, So that I can add new capabilities without code changes.

## Acceptance Criteria

1. **Given** the .claude/skills/ directory exists, **When** a skill file is present, **Then** the skill definition is loaded at startup
2. Skills are defined in markdown files (.md)
3. Each skill has a name, description, and instructions
4. Skills can specify required tools or capabilities
5. Skill loading is logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Skills Loader** (AC: #1, #2) - Load from .claude/skills/
- [ ] **Task 2: Parse Skill Format** (AC: #3) - Name, description, instructions
- [ ] **Task 3: Handle Dependencies** (AC: #4) - Required tools
- [ ] **Task 4: Log Loading** (AC: #5) - Trace in Langfuse
- [ ] **Task 5: Create Example Skill** - .claude/skills/search-workspace.md

## Dev Notes

### Skill File Format

```markdown
---
name: search-workspace
description: Search the workspace for relevant files
tools: [Read, Grep, Glob]
---

# Search Workspace

When the user asks to find files or search the codebase...
```

### File List

Files to create:
- `src/extensions/skills/loader.ts`
- `.claude/skills/search-workspace.md`

