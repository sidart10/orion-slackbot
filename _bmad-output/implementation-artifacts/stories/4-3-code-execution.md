# Story 4.3: Code Execution

Status: ready-for-dev

## Story

As a **user**,
I want generated code to actually run and produce results,
So that I get actionable output, not just code.

## Acceptance Criteria

1. **Given** code is generated and sandbox is ready, **When** the code is executed, **Then** it runs in the sandboxed environment (FR20)

2. **Given** code is running, **When** output is produced, **Then** execution output (stdout, stderr) is captured

3. **Given** code is running, **When** limits are checked, **Then** execution is subject to timeout limits

4. **Given** execution completes, **When** results are available, **Then** results are returned to the agent for processing

5. **Given** execution occurs, **When** tracing is active, **Then** execution events are logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Execution Module** (AC: #1)
  - [ ] Create `src/tools/sandbox/executor.ts`
  - [ ] Implement `executeCode()` function
  - [ ] Use Claude SDK Bash tool
  - [ ] Handle execution lifecycle

- [ ] **Task 2: Capture Output** (AC: #2)
  - [ ] Capture stdout
  - [ ] Capture stderr
  - [ ] Handle binary output

- [ ] **Task 3: Enforce Timeout** (AC: #3)
  - [ ] Set execution timeout
  - [ ] Kill on timeout
  - [ ] Return timeout error

- [ ] **Task 4: Return Results** (AC: #4)
  - [ ] Structure execution result
  - [ ] Include output and errors
  - [ ] Format for agent

- [ ] **Task 5: Add Langfuse Logging** (AC: #5)
  - [ ] Create execution span
  - [ ] Log code and output
  - [ ] Track duration

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Generate and execute code
  - [ ] Verify output captured
  - [ ] Test timeout behavior
  - [ ] Check Langfuse traces

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR20 | prd.md | Execute code in sandboxed environment |

### Execution Result Structure

```typescript
interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
}

async function executeCode(
  code: GeneratedCode,
  config?: SandboxConfig
): Promise<ExecutionResult> {
  // Execute using Claude SDK Bash tool
  // Return structured result
}
```

### References

- [Source: _bmad-output/epics.md#Story 4.3] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Claude SDK's Bash tool handles execution
- Always capture both stdout and stderr
- Consider streaming long outputs

### File List

Files to create:
- `src/tools/sandbox/executor.ts`

