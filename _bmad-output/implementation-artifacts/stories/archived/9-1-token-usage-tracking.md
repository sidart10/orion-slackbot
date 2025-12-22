# Story 9.1: Token Usage Tracking

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Langfuse already captures token usage via SDK instrumentation

## Story

As a **platform admin**, I want to see token usage for each interaction, So that I can understand resource consumption.

## Acceptance Criteria

1. **Given** interactions are traced in Langfuse, **When** an interaction completes, **Then** input and output token counts are logged (FR36)
2. Token usage is associated with the trace
3. Usage is broken down by model (if multiple models used)
4. Token data is available in Langfuse dashboard
5. Historical token usage can be queried

## Tasks / Subtasks

- [ ] **Task 1: Capture Token Counts** (AC: #1) - From API response
- [ ] **Task 2: Associate with Trace** (AC: #2) - Add to trace metadata
- [ ] **Task 3: Break Down by Model** (AC: #3) - Track per model
- [ ] **Task 4: Expose in Dashboard** (AC: #4) - Langfuse metadata
- [ ] **Task 5: Enable Queries** (AC: #5) - Historical data
- [ ] **Task 6: Verification** - Check token data in Langfuse

## Dev Notes

### Token Tracking

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
}

function trackTokenUsage(trace: LangfuseTrace, usage: TokenUsage): void {
  trace.update({
    metadata: {
      tokenUsage: usage,
    },
  });
}
```

### File List

Files to modify:
- `src/observability/tracing.ts`
- `src/agent/orion.ts`

