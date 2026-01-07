# Sprint Change Proposal: Anthropic Managed PTC Tech Spec Revisions

**Date:** 2026-01-06
**Proposed By:** John (PM)
**Status:** ✅ APPROVED
**Approved By:** Sid (2026-01-06)
**Impact Level:** Medium (Scope Expansion)

---

## Change Summary

The tech spec for **Anthropic Managed Programmatic Tool Calling (PTC)** requires revisions to address gaps discovered during PM review. The core approach remains valid, but critical implementation details were missing.

**Original Estimate:** 1-2 days
**Revised Estimate:** 2-3 days
**Delta:** +1 day

---

## Change Trigger

During comprehensive review of `tech-spec-anthropic-managed-ptc.md`, the following gaps were identified:

1. No validation of core assumption (MCP tools + `allowed_callers`)
2. Missing error handling strategy for PTC-specific failures
3. Undocumented streaming behavior change affecting UX
4. Missing message formatting restrictions for PTC tool results
5. No observability/cost tracking for PTC operations

---

## Impact Analysis

### What Changes

| Area | Original Spec | Revised Spec |
|------|---------------|--------------|
| **Tasks** | 6 tasks | 8 tasks (+validation spike, +streaming UX) |
| **Acceptance Criteria** | 6 ACs | 10 ACs (+error handling, +formatting, +UX, +metrics) |
| **Error Handling** | Not specified | Comprehensive strategy added |
| **Streaming** | Not addressed | Behavior change documented, status messages added |
| **Observability** | Basic logging | PTC-specific metrics added |

### What Stays the Same

- Core PTC integration approach (beta header, `allowed_callers`, response handling)
- Decision to use single caller mode (`["code_execution_20250825"]` only)
- GKE sandbox remains separate for Skills
- Rollback plan (all changes additive)

### Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `@anthropic-ai/sdk` | OK | ^0.71.x supports PTC |
| MCP tools | Needs Validation | Task 0 validates assumption |
| Slack streaming | Minor Update | Status messages for PTC |
| Langfuse | Minor Update | New event types |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP tools don't work with PTC | Low | High | Task 0 validation spike before full implementation |
| Container timeouts | Medium | Medium | Error handling + fallback to direct calls |
| UX degradation (long pauses) | Medium | Low | Status messages inform users |

---

## Detailed Changes

### New Task 0: Validation Spike

**Effort:** 2-4 hours
**Purpose:** Validate core assumption before committing to full implementation

**Steps:**
1. Create minimal test harness with one MCP tool
2. Add `allowed_callers: ["code_execution_20250825"]` to tool definition
3. Send request with `code_execution` tool + MCP tool
4. Verify:
   - `tool_use` block has `caller.type === "code_execution_20250825"`
   - Tool result flows back correctly
   - Claude receives result and continues

**Gate:** If validation fails, STOP and revise architecture.

### Expanded Task 4: PTC Response Handling

**Original:** Handle `server_tool_use`, `tool_use` with caller, `code_execution_tool_result`

**Added:**
```typescript
// Error handling for container expiration
if (block.type === 'code_execution_tool_result') {
  const result = block.content;
  if (result.return_code !== 0) {
    if (result.stderr.includes('TimeoutError')) {
      logger.warn({
        event: 'agent.loop.ptc_tool_timeout',
        stderr: result.stderr.slice(0, 500),
        traceId,
      });
    }
    if (result.stderr.includes('container_expired')) {
      logger.error({
        event: 'agent.loop.ptc_container_expired',
        traceId,
      });
    }
  }
}

// Message formatting restriction for PTC
const isProgrammaticToolCall = toolUsesThisCall.some(
  t => (t as any).caller?.type === 'code_execution_20250825'
);

if (isProgrammaticToolCall) {
  // PTC tool results MUST NOT include text content
  attemptMessages.push({
    role: 'user',
    content: toolResults.map(r => ({
      type: 'tool_result',
      tool_use_id: r.tool_use_id,
      content: r.content,
    })),
  });
} else {
  // Standard tool results can include text
  attemptMessages.push({
    role: 'user',
    content: toolResults,
  });
}
```

### New Task 7: Streaming UX Updates

**Effort:** 2 hours

**Changes to `src/slack/utils/status-messages.ts`:**
```typescript
export function getToolStatusMessage(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  // PTC-specific status
  if (toolName === 'code_execution') {
    return 'Running multi-tool analysis...';
  }

  // Existing status messages...
}
```

**Changes to agent loop:**
```typescript
if (block.type === 'server_tool_use' && block.name === 'code_execution') {
  void options.setStatus?.({
    phase: 'tool',
    toolName: 'code_execution',
    toolInput: { mode: 'programmatic_batch' },
  });
}
```

### New Task 8: Observability Enhancements

**Effort:** 2 hours

**New metrics in Langfuse:**
```typescript
// On PTC completion
langfuseClient.event({
  name: 'ptc_execution_completed',
  metadata: {
    traceId,
    containerTime: containerTimeMs,
    toolCallCount: activeCodeExecution?.toolCalls.length,
    estimatedTokenSavings: estimateTokenSavings(toolResults),
  },
});

// Helper to estimate savings
function estimateTokenSavings(toolResults: ToolResult[]): number {
  const totalResultSize = toolResults.reduce(
    (sum, r) => sum + JSON.stringify(r.content).length,
    0
  );
  // Rough estimate: 4 chars per token, only stdout enters context
  const tokensAvoided = Math.floor(totalResultSize / 4);
  return tokensAvoided;
}
```

---

## New Acceptance Criteria

### AC7: PTC Error Handling
- **Given** a container expires during PTC execution
- **When** the error is returned in `code_execution_tool_result`
- **Then** Orion logs `ptc_container_expired` event
- **And** Claude receives the error and can adapt

### AC8: Message Formatting Compliance
- **Given** a programmatic tool call (caller.type === "code_execution_20250825")
- **When** Orion builds the response message with tool results
- **Then** the message contains ONLY tool_result blocks
- **And** no text content is included (per Anthropic spec)

### AC9: Streaming UX
- **Given** Claude starts code execution
- **When** `server_tool_use` block with name "code_execution" is received
- **Then** Slack status updates to "Running multi-tool analysis..."
- **And** status clears when `code_execution_tool_result` is received

### AC10: Cost & Performance Tracking
- **Given** a query uses PTC
- **When** the query completes
- **Then** Langfuse traces include:
  - `ptc_tool_call_count`: Number of tools called in batch
  - `ptc_container_time_ms`: Time spent in Anthropic sandbox
  - `ptc_token_savings_estimate`: Estimated tokens saved vs direct calls

---

## Updated Task Breakdown

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| **0** | Validation spike (MCP + PTC) | 2-4h | NEW |
| **1** | Add beta header | 30m | Unchanged |
| **2** | Add code_execution tool type | 1h | Unchanged |
| **3** | Add `allowed_callers` to MCP tools | 1h | Unchanged |
| **4** | Handle PTC response types + errors + formatting | 4h | EXPANDED |
| **5** | Handle container field | 1h | Unchanged |
| **6** | Update types | 1h | Unchanged |
| **7** | Streaming UX updates | 2h | NEW |
| **8** | Observability enhancements | 2h | NEW |

**Total: 14-16 hours (2-3 days)**

---

## Testing Strategy Updates

### Unit Tests (Additional)

```typescript
// src/agent/loop.test.ts

describe('PTC message formatting', () => {
  it('excludes text from PTC tool result messages', async () => {
    // Verify message contains only tool_result blocks
  });
});

describe('PTC error handling', () => {
  it('logs container expiration errors', async () => {
    const mockResponse = {
      content: [{
        type: 'code_execution_tool_result',
        content: {
          return_code: 1,
          stderr: 'container_expired: Container no longer available',
          stdout: '',
        },
      }],
    };
    // Verify error is logged
  });
});
```

### Integration Tests (Additional)

1. **E2E with container timeout simulation**
   - Mock slow tool response (>4.5 min)
   - Verify timeout handling and logging

2. **Status message verification**
   - Trigger PTC execution
   - Verify Slack receives "Running multi-tool analysis..."

---

## Rollback Plan

Unchanged from original spec. All changes are additive:

1. Remove `advanced-tool-use-2025-11-20` from betas
2. Remove `allowed_callers` from MCP tools
3. Remove `code_execution` tool from tools array
4. Remove PTC-specific response handling (falls through to standard handling)

---

## Decision Required

**Options:**

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A** | Approve expanded scope (+1 day) | Recommended |
| **B** | Proceed with original spec, accept gaps | Not recommended |
| **C** | Defer PTC entirely | Not recommended |

**Recommendation:** Option A - The additional day ensures robust error handling and good UX. Shipping without these would create production issues.

---

## Approval

- [x] **Product Owner:** Approve scope expansion (Sid, 2026-01-06)
- [ ] **Tech Lead:** Review technical additions
- [ ] **Dev:** Accept revised estimate

---

## References

- [Anthropic PTC Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)
- [Anthropic Code Execution Pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)
- Original tech spec: `_bmad-output/implementation-artifacts/stories/tech-spec-anthropic-managed-ptc.md`
- PRD cost target: <$0.10/query (Section 5.2)
