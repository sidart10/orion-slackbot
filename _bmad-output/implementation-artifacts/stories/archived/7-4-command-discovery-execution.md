# Story 7.4: Command Discovery & Execution

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: SDK handles command triggering natively

## Story

As a **user**, I want to trigger Commands in my messages, So that I can run specific workflows directly.

## Acceptance Criteria

1. **Given** Commands are loaded, **When** I use a command trigger pattern, **Then** the corresponding Command is matched
2. Command parameters are extracted from the message
3. The Command workflow is executed
4. Command results are returned to the user
5. Adding a new Command file is all that's needed to extend (FR25)

## Tasks / Subtasks

- [ ] **Task 1: Match Commands** (AC: #1) - Pattern matching on trigger
- [ ] **Task 2: Extract Parameters** (AC: #2) - Parse from message
- [ ] **Task 3: Execute Workflow** (AC: #3) - Run command workflow
- [ ] **Task 4: Return Results** (AC: #4) - Format for Slack
- [ ] **Task 5: Verify Extension** (AC: #5) - Add command, verify works

## Dev Notes

### Command Matching

```typescript
function matchCommand(message: string, commands: Command[]): CommandMatch | null {
  for (const cmd of commands) {
    const match = message.match(new RegExp(cmd.trigger, 'i'));
    if (match) {
      return { command: cmd, params: extractParams(match) };
    }
  }
  return null;
}
```

### File List

Files to create: `src/extensions/commands/executor.ts`

