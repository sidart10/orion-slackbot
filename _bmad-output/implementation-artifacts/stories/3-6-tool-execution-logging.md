# Story 3.6: Tool Execution Logging

Status: ready-for-dev

## Story

As a **platform admin**,
I want to see all tool executions and their results,
So that I can debug issues and audit tool usage.

## Acceptance Criteria

1. **Given** tools are being executed, **When** a tool call completes (success or failure), **Then** the execution is logged via Langfuse (FR39)

2. **Given** logging is active, **When** logs are reviewed, **Then** logs include: tool name, arguments, result, duration, success/failure

3. **Given** traces are created, **When** viewing in Langfuse, **Then** tool execution spans are visible in the Langfuse trace

4. **Given** a tool fails, **When** the failure is logged, **Then** failed tool calls include error details

5. **Given** structured logging is required, **When** logs are written, **Then** structured JSON logging is used (AR12)

## Tasks / Subtasks

- [ ] **Task 1: Create Tool Execution Spans** (AC: #1, #3)
  - [ ] Create span for each tool execution
  - [ ] Include tool metadata in span
  - [ ] Nest under agent execution span

- [ ] **Task 2: Log Execution Details** (AC: #2)
  - [ ] Log tool name and server
  - [ ] Log input arguments
  - [ ] Log output/result
  - [ ] Log duration

- [ ] **Task 3: Handle Success/Failure** (AC: #2, #4)
  - [ ] Log success status
  - [ ] Log error details on failure
  - [ ] Include stack traces for errors

- [ ] **Task 4: Structured JSON Logging** (AC: #5)
  - [ ] Use LogEntry interface
  - [ ] Include all required fields
  - [ ] Add trace ID for correlation

- [ ] **Task 5: Verification** (AC: all)
  - [ ] Execute tool via Orion
  - [ ] Check Langfuse for span
  - [ ] Verify all details logged
  - [ ] Test error logging

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR39 | prd.md | Tool execution logged via Langfuse |
| AR12 | architecture.md | Structured JSON logging |

### Tool Execution Log Entry

```typescript
interface ToolExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: 'tool_execution';
  traceId: string;
  tool: {
    name: string;
    server: string;
    arguments: unknown;
  };
  result: {
    success: boolean;
    duration: number;
    output?: unknown;
    error?: string;
  };
}
```

### References

- [Source: _bmad-output/epics.md#Story 3.6] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Langfuse spans provide execution visibility
- Consider aggregating tool metrics for dashboards
- Redact sensitive arguments if needed

### File List

Files to modify:
- `src/tools/executor.ts` (add logging)
- `src/observability/tracing.ts` (tool spans)

