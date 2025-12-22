# Story 4-1-merged: Code Execution via Vercel Sandbox

Status: ready-for-dev

## Consolidated From

This story consolidates the following stories into a single cohesive implementation:

| Original Story | Title | Reason for Merge |
|---------------|-------|------------------|
| 4-1 | Code Generation Capability | Core functionality |
| 4-4 | External API Calls via Code | Uses same sandbox infrastructure |
| 4-5 | Data Processing via Code | Uses same sandbox infrastructure |
| 4-6 | Code Output Validation | Part of execution pipeline |

**Merge Date**: 2025-12-21
**See**: sprint-change-proposal-sdk-alignment-2025-12-21.md

## Story

As a **user**,
I want Orion to generate, execute, and validate code in a sandboxed environment,
So that I can accomplish complex tasks that require computation, API calls, or data processing.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3-0 Vercel Sandbox Runtime | ✅ done | Sandbox execution infrastructure |
| 2-1 Claude Agent SDK Integration | ✅ done | Agent query capabilities |
| 1-2 Langfuse Instrumentation | ✅ done | Tracing for code execution |

## Acceptance Criteria

### Code Generation (from 4-1)

1. **Given** the agent needs to perform an action, **When** no MCP tool exists for the task, **Then** the agent generates executable code (FR19)

2. **Given** code is being generated, **When** language selection occurs, **Then** code is generated in Python or JavaScript/TypeScript as appropriate

3. **Given** code is generated, **When** tracing is active, **Then** the generated code is included in the Langfuse trace

### External API Calls (from 4-4)

4. **Given** generated code needs external data, **When** the code executes, **Then** HTTP requests to external APIs work within the sandbox

5. **Given** an API call is made, **When** timeouts or errors occur, **Then** errors are caught and reported gracefully

### Data Processing (from 4-5)

6. **Given** user provides data or fetches it, **When** processing is requested, **Then** the sandbox can transform, filter, and aggregate data

7. **Given** data processing completes, **When** results are returned, **Then** structured data is formatted appropriately for Slack

### Code Validation (from 4-6)

8. **Given** code execution completes, **When** results are evaluated, **Then** output is validated for correctness and safety

9. **Given** code produces an error, **When** the error is handled, **Then** useful error messages are returned to the user

10. **Given** code execution fails validation, **When** retry is needed, **Then** the agent can attempt to fix and re-execute

## Tasks / Subtasks

- [ ] **Task 1: Create Code Generation Module** (AC: #1, #2, #3)
  - [ ] Create `src/tools/sandbox/generator.ts`
  - [ ] Implement `generateCode()` function using Claude SDK
  - [ ] Support Python and TypeScript language selection
  - [ ] Add code generation to Langfuse trace

- [ ] **Task 2: Integrate with Vercel Sandbox** (AC: #1)
  - [ ] Connect generator to `src/sandbox/vercel-runtime.ts`
  - [ ] Pass generated code to sandbox for execution
  - [ ] Handle sandbox response and errors

- [ ] **Task 3: Enable External API Calls** (AC: #4, #5)
  - [ ] Ensure sandbox allows outbound HTTP requests
  - [ ] Implement timeout handling (30s max per NFR19)
  - [ ] Add retry logic for transient failures
  - [ ] Log external calls in trace

- [ ] **Task 4: Support Data Processing** (AC: #6, #7)
  - [ ] Allow data transformation in sandbox
  - [ ] Support JSON, CSV parsing
  - [ ] Format output for Slack mrkdwn
  - [ ] Handle large data sets appropriately

- [ ] **Task 5: Implement Output Validation** (AC: #8, #9, #10)
  - [ ] Create `src/tools/sandbox/validator.ts`
  - [ ] Validate output structure and types
  - [ ] Check for common error patterns
  - [ ] Implement self-healing retry on validation failure

- [ ] **Task 6: User Notification** (AC: all)
  - [ ] Update status to "writing code..." during generation
  - [ ] Show code execution progress
  - [ ] Format code blocks for Slack display
  - [ ] Include execution time in response

- [ ] **Task 7: Verification Tests** (AC: all)
  - [ ] Test code generation for various tasks
  - [ ] Test external API call success and failure
  - [ ] Test data transformation scenarios
  - [ ] Test validation and retry logic

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR19 | prd.md | Generate executable code |
| FR22 | prd.md | Execute code in sandboxed environment |
| AR15 | architecture.md | Tool fallback to code generation |
| NFR19 | prd.md | 30 second timeout per tool call |

### Key Integration Point

Story 3-0 (Vercel Sandbox Runtime) provides the execution environment. This story adds:
1. Code generation layer
2. External API call support
3. Data processing patterns
4. Validation and error handling

### Code Generation Pattern

```typescript
interface GeneratedCode {
  language: 'python' | 'typescript';
  code: string;
  purpose: string;
  dependencies?: string[];
}

async function generateCode(
  task: string,
  context: AgentContext
): Promise<GeneratedCode> {
  // Use Claude SDK to generate appropriate code
  // Return structured code block
}

async function executeWithValidation(
  code: GeneratedCode,
  sandbox: VercelSandbox
): Promise<ExecutionResult> {
  const result = await sandbox.execute(code);
  const validated = await validateOutput(result);
  
  if (!validated.success && validated.canRetry) {
    const fixedCode = await generateCode(
      `Fix this error: ${validated.error}\n\nOriginal code:\n${code.code}`,
      context
    );
    return sandbox.execute(fixedCode);
  }
  
  return validated;
}
```

### File List

Files to create:
- `src/tools/sandbox/generator.ts`
- `src/tools/sandbox/generator.test.ts`
- `src/tools/sandbox/validator.ts`
- `src/tools/sandbox/validator.test.ts`

Files to modify:
- `src/sandbox/vercel-runtime.ts` (if needed for API calls)
- `src/agent/orion.ts` (integrate code generation)

### References

- [Source: _bmad-output/epics.md#Epic 4] — Original epic
- [Source: _bmad-output/architecture.md#Code Execution] — Architecture patterns
- [Source: sprint-change-proposal-sdk-alignment-2025-12-21.md] — Merge rationale

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Consolidates 4 related stories into cohesive implementation
- Builds on existing Vercel Sandbox infrastructure from 3-0
- Focus on end-to-end code generation → execution → validation flow

### File List

Files to create:
- `src/tools/sandbox/generator.ts`
- `src/tools/sandbox/generator.test.ts`
- `src/tools/sandbox/validator.ts`
- `src/tools/sandbox/validator.test.ts`

Files to modify:
- `src/sandbox/vercel-runtime.ts`
- `src/agent/orion.ts`

