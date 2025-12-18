# Story 7.3: Commands Framework Infrastructure

Status: ready-for-dev

## Story

As a **developer**, I want a framework for defining Commands, So that users can trigger specific workflows.

## Acceptance Criteria

1. **Given** the .claude/commands/ directory exists, **When** a command file is present, **Then** the command definition is loaded at startup
2. Commands are defined in markdown files (.md)
3. Each command has a trigger pattern and workflow
4. Commands can accept parameters
5. Command loading is logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Commands Loader** (AC: #1, #2) - Load from .claude/commands/
- [ ] **Task 2: Parse Command Format** (AC: #3) - Trigger pattern, workflow
- [ ] **Task 3: Handle Parameters** (AC: #4) - Extract from message
- [ ] **Task 4: Log Loading** (AC: #5) - Trace in Langfuse
- [ ] **Task 5: Create Example Command** - .claude/commands/help.md

## Dev Notes

### Command File Format

```markdown
---
name: help
trigger: /help|show help|what can you do
---

# Help Command

Display available capabilities and suggested prompts...
```

### File List

Files to create:
- `src/extensions/commands/loader.ts`
- `.claude/commands/help.md`

