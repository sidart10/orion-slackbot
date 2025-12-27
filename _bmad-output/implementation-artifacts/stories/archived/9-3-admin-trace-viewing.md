# Story 9.3: Admin Trace Viewing

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Langfuse dashboard provides this functionality

## Story

As a **platform admin**, I want to view detailed traces for debugging, So that I can diagnose issues and optimize performance.

## Acceptance Criteria

1. **Given** interactions are traced in Langfuse, **When** I access the Langfuse dashboard, **Then** I can view traces for any interaction (FR37)
2. Traces include: user ID, input, output, tool calls, timing
3. Spans show the agent loop phases (gather, act, verify)
4. Failed interactions have clear error details
5. Traces can be filtered and searched

## Tasks / Subtasks

- [ ] **Task 1: Ensure Complete Traces** (AC: #1) - All interactions traced
- [ ] **Task 2: Include All Fields** (AC: #2) - User, I/O, tools, timing
- [ ] **Task 3: Show Loop Phases** (AC: #3) - Gather, act, verify spans
- [ ] **Task 4: Log Errors Clearly** (AC: #4) - Error details in trace
- [ ] **Task 5: Enable Filtering** (AC: #5) - Metadata for search
- [ ] **Task 6: Verification** - Verify in Langfuse dashboard

## Dev Notes

### Trace Structure

```
Trace: user-message-handler
├── Metadata: { userId, teamId, channelId }
├── Input: { text }
├── Spans:
│   ├── phase-gather
│   ├── phase-act
│   ├── phase-verify
│   └── response-streaming
├── Output: { response, metrics }
└── Duration: XXXms
```

### File List

Files to modify: `src/observability/tracing.ts`

