# ATDD Checklist - Epic 6, Story 6.3: Anthropic Managed Programmatic Tool Calling (PTC)

**Date:** 2026-01-06
**Author:** Murat (TEA Agent)
**Primary Test Level:** Unit Tests (Vitest)

---

## Story Summary

Enable Claude to orchestrate MCP tools through Python code in Anthropic's container, reducing context window usage by ~37%.

**As a** Orion platform
**I want** to enable Anthropic's Programmatic Tool Calling (PTC) feature
**So that** Claude can orchestrate multiple MCP tools through code, reducing token usage and enabling complex multi-tool workflows.

---

## Acceptance Criteria

### Core PTC (AC1-AC6)

1. **AC1** - Given `advanced-tool-use-2025-11-20` beta header enabled, When Claude requests PTC, Then `server_tool_use` block with `code_execution` is processed
2. **AC2** - Given MCP tools with `allowed_callers: ["code_execution_20250825"]`, When Claude runs code, Then tools are callable from Python
3. **AC3** - Given PTC code execution completes, When `code_execution_tool_result` received, Then result processed and loop continues
4. **AC4** - Given tool called via PTC, When `tool_use` block has `caller.type === "code_execution_20250825"`, Then Orion routes tool call correctly
5. **AC5** - Given container field returned, When new request made, Then container reused for session
6. **AC6** - Given PTC enabled, When comparing to direct calls, Then token usage reduced by ~37% for multi-tool queries

### Error Handling & UX (AC7-AC10)

7. **AC7** - Given container expires during PTC execution, When error returned in `code_execution_tool_result`, Then Orion logs `ptc_container_expired` event and Claude can adapt
8. **AC8** - Given programmatic tool call (`caller.type === "code_execution_20250825"`), When Orion builds response message, Then message contains ONLY `tool_result` blocks (no text content per Anthropic spec)
9. **AC9** - Given Claude starts code execution, When `server_tool_use` with name `code_execution` received, Then Slack status updates to "Running multi-tool analysis..." and clears on result
10. **AC10** - Given a query uses PTC, When query completes, Then Langfuse traces include `ptc_tool_call_count`, `ptc_container_time_ms`, `ptc_token_savings_estimate`

---

## Failing Tests Created (RED Phase)

### Unit Tests - Agent Loop (10 tests)

**File:** `src/agent/loop.test.ts` (additions)

1. **Test:** `PTC: should process server_tool_use block and emit status (AC1, AC9)`
   - **Status:** RED - `server_tool_use` block type not handled
   - **Verifies:** Beta header enables PTC, status updates on server_tool_use

2. **Test:** `PTC: should route tool_use with caller.type to correct handler (AC4)`
   - **Status:** RED - `caller` field not checked on tool_use blocks
   - **Verifies:** Programmatic tool calls routed correctly

3. **Test:** `PTC: should process code_execution_tool_result and continue loop (AC3)`
   - **Status:** RED - `code_execution_tool_result` block type not handled
   - **Verifies:** PTC result processed, loop continues

4. **Test:** `PTC: should reuse container across requests in session (AC5)`
   - **Status:** RED - Container field not extracted/reused
   - **Verifies:** Container ID passed to subsequent requests

5. **Test:** `PTC: should format PTC tool_result messages without text content (AC8)`
   - **Status:** RED - Programmatic tool results include text
   - **Verifies:** Anthropic spec compliance for PTC responses

6. **Test:** `PTC: should log ptc_container_expired on container expiration (AC7)`
   - **Status:** RED - Container expiration not detected/logged
   - **Verifies:** Error handling for expired containers

7. **Test:** `PTC: should log ptc_tool_timeout on timeout errors (AC7)`
   - **Status:** RED - Timeout errors not detected in PTC
   - **Verifies:** Timeout error handling in PTC

8. **Test:** `PTC: should emit Langfuse ptc_execution_completed event (AC10)`
   - **Status:** RED - No PTC-specific Langfuse events
   - **Verifies:** Observability metrics for PTC

9. **Test:** `PTC: should estimate token savings in trace metadata (AC10)`
   - **Status:** RED - No token savings calculation
   - **Verifies:** Token savings estimate in Langfuse

10. **Test:** `PTC: should clear status on code_execution_tool_result (AC9)`
    - **Status:** RED - Status not cleared after PTC completes
    - **Verifies:** Slack status lifecycle

### Unit Tests - Schema Converter (2 tests)

**File:** `src/tools/mcp/schema-converter.test.ts` (new file)

1. **Test:** `mcpToolToClaude should include allowed_callers for PTC (AC2)`
   - **Status:** RED - `allowed_callers` not added to tool definitions
   - **Verifies:** MCP tools callable from code execution

2. **Test:** `mcpToolToClaude should set allowed_callers to code_execution_20250825 (AC2)`
   - **Status:** RED - Caller mode value incorrect
   - **Verifies:** Single caller mode configuration

### Unit Tests - Status Messages (2 tests)

**File:** `src/slack/status-messages.test.ts` (new file)

1. **Test:** `buildLoadingMessages should return PTC status for code_execution tool (AC9)`
   - **Status:** RED - No PTC-specific status message
   - **Verifies:** "Running multi-tool analysis..." message

2. **Test:** `buildLoadingMessages should handle PTC mode input (AC9)`
   - **Status:** RED - `mode: 'programmatic_batch'` not handled
   - **Verifies:** PTC mode parameter support

---

## Data Factories Created

### PTC Stream Factory

**File:** `tests/factories/agent-factory.ts` (additions)

**New Exports:**

- `createMockStreamWithPtc(params)` - Create mock stream with PTC events
- `createPtcServerToolUseBlock(id, name)` - Create server_tool_use block
- `createPtcToolUseWithCaller(toolId, callerId, name, input)` - Create tool_use with caller
- `createPtcCodeExecutionResult(returnCode, stdout, stderr)` - Create code_execution_tool_result

**Example Usage:**

```typescript
const stream = createMockStreamWithPtc({
  containerId: 'container-123',
  serverToolUseId: 'stu_1',
  toolCalls: [
    { name: 'search_api', input: { query: 'test' } },
  ],
  codeResult: { return_code: 0, stdout: 'result', stderr: '' },
});
```

---

## Fixtures Created

### PTC Test Fixture (Extension)

**File:** `tests/factories/agent-factory.ts`

Uses existing `createAgentLoopOptions()` with additional PTC-specific overrides:

```typescript
const options = createAgentLoopOptions({
  executeTool: ptcExecuteTool,
  setStatus: mockSetStatus,
});
```

**Setup:** Creates agent context with PTC-enabled configuration
**Provides:** Mock stream with PTC events, status tracker
**Cleanup:** Handled by Vitest's `vi.clearAllMocks()`

---

## Mock Requirements

### Anthropic SDK Mock (Existing)

Already mocked in `loop.test.ts`:

**Endpoint:** `messages.create()`
**PTC Response Events:**
- `server_tool_use` start
- `tool_use` with `caller` field
- `code_execution_tool_result`

**Container Response:**
```json
{
  "type": "message_start",
  "message": {
    "model": "claude-sonnet-4-20250514",
    "container": "container-123"
  }
}
```

### Langfuse Mock (Existing)

Already mocked in `loop.test.ts`:

**Event Mock Required:**
- Name: `ptc_execution_completed`
- Metadata: `{ containerTimeMs, toolCallCount, estimatedTokenSavings }`

---

## Required data-testid Attributes

Not applicable for this story (no UI components).

---

## Implementation Checklist

### Test: PTC server_tool_use processing (AC1, AC9)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Add `advanced-tool-use-2025-11-20` to beta header (line ~45)
- [ ] Add `{ type: 'code_execution' }` to tools array (line ~92)
- [ ] Handle `server_tool_use` in content_block_start switch (line ~614)
- [ ] Call `setStatus` with PTC message on server_tool_use
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should process server_tool_use"`
- [ ] Test passes (green phase)

**Estimated Effort:** 1 hour

---

### Test: PTC tool_use with caller routing (AC4)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Check for `caller` field on tool_use blocks (line ~620)
- [ ] Set `isProgrammaticCall = true` when `caller.type === 'code_execution_20250825'`
- [ ] Route programmatic tool calls through existing executeTool
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should route tool_use"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: PTC code_execution_tool_result processing (AC3)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Add inline type `CodeExecutionToolResultBlock` (line ~345)
- [ ] Handle `code_execution_tool_result` in content_block_start
- [ ] Log result and continue loop
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should process code_execution_tool_result"`
- [ ] Test passes (green phase)

**Estimated Effort:** 1 hour

---

### Test: Container reuse (AC5)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Add `let activeContainer: string | undefined` at loop scope
- [ ] Extract container from `message_start` event
- [ ] Pass container to subsequent `messages.create()` calls
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should reuse container"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: PTC tool_result message format (AC8)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Check `isProgrammaticCall` when building response message
- [ ] If programmatic, include ONLY `tool_result` blocks (no text)
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should format PTC tool_result"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: Container expiration logging (AC7)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Check stderr for `container_expired` string
- [ ] Log `agent.loop.ptc_container_expired` event
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should log ptc_container_expired"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: Timeout error logging (AC7)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Check stderr for `TimeoutError` string
- [ ] Log `agent.loop.ptc_tool_timeout` event
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should log ptc_tool_timeout"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: Langfuse PTC event (AC10)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Import `getLangfuse` (already imported)
- [ ] On PTC completion, emit `ptc_execution_completed` event
- [ ] Include `containerTimeMs`, `toolCallCount` in metadata
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should emit Langfuse"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: Token savings estimation (AC10)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Add `estimateTokenSavings(toolResults)` helper function
- [ ] Calculate savings as ~4 chars per token
- [ ] Include `estimatedTokenSavings` in Langfuse metadata
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should estimate token savings"`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: Status clear on result (AC9)

**File:** `src/agent/loop.ts`

**Tasks to make this test pass:**
- [ ] Clear status when `code_execution_tool_result` received
- [ ] Call `setStatus(undefined)` or equivalent
- [ ] Run test: `pnpm vitest run src/agent/loop.test.ts -t "PTC: should clear status"`
- [ ] Test passes (green phase)

**Estimated Effort:** 15 min

---

### Test: allowed_callers in schema converter (AC2)

**File:** `src/tools/mcp/schema-converter.ts`

**Tasks to make this test pass:**
- [ ] Add `allowed_callers?: string[]` to `AnthropicTool` interface
- [ ] Set `allowed_callers: ['code_execution_20250825']` in `mcpToolToClaude()`
- [ ] Run test: `pnpm vitest run src/tools/mcp/schema-converter.test.ts`
- [ ] Test passes (green phase)

**Estimated Effort:** 30 min

---

### Test: PTC status message (AC9)

**File:** `src/slack/status-messages.ts`

**Tasks to make this test pass:**
- [ ] Add check for `toolName === 'code_execution'` in `buildLoadingMessages()`
- [ ] Return `['Running multi-tool analysis...']` for PTC
- [ ] Run test: `pnpm vitest run src/slack/status-messages.test.ts`
- [ ] Test passes (green phase)

**Estimated Effort:** 15 min

---

## Running Tests

```bash
# Run all failing tests for this story
pnpm vitest run --grep "PTC:"

# Run specific test file
pnpm vitest run src/agent/loop.test.ts

# Run tests in watch mode
pnpm vitest src/agent/loop.test.ts

# Run with coverage
pnpm vitest run --coverage

# Run schema converter tests
pnpm vitest run src/tools/mcp/schema-converter.test.ts

# Run status message tests
pnpm vitest run src/slack/status-messages.test.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- Tests written and failing
- Factory helpers created for PTC mock streams
- Mock requirements documented
- Implementation checklist created

**Verification:**

- All tests run and fail as expected
- Failure messages are clear and actionable
- Tests fail due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with AC1)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Check off the task** in implementation checklist
6. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

**Progress Tracking:**

- Check off tasks as you complete them
- Share progress in daily standup
- Mark story as IN PROGRESS in `sprint-status.yaml`

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** (readability, maintainability)
3. **Extract duplications** (DRY principle)
4. **Ensure tests still pass** after each refactor
5. **Update documentation** (if API contracts change)

**Key Principles:**

- Tests provide safety net (refactor with confidence)
- Make small refactors (easier to debug if tests fail)
- Run tests after each change
- Don't change test behavior (only implementation)

**Completion:**

- All tests pass
- Code quality meets team standards
- No duplications or code smells
- Ready for code review and story approval

---

## Next Steps

1. **Review this checklist** with team in standup or planning
2. **Run failing tests** to confirm RED phase: `pnpm vitest run --grep "PTC:"`
3. **Begin implementation** using implementation checklist as guide
4. **Work one test at a time** (red → green for each)
5. **Share progress** in daily standup
6. **When all tests pass**, refactor code for quality
7. **When refactoring complete**, manually update story status to 'done' in sprint-status.yaml

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **data-factories.md** - Factory patterns for PTC mock streams with overrides
- **test-quality.md** - Deterministic tests, no hard waits, explicit assertions
- **test-levels-framework.md** - Unit tests selected (internal API behavior)

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `pnpm vitest run --grep "PTC:" 2>&1`

**Expected Results:**

```
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should process server_tool_use block
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should route tool_use with caller
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should process code_execution_tool_result
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should reuse container
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should format PTC tool_result without text
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should log container expiration
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should log timeout errors
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should emit Langfuse event
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should estimate token savings
 FAIL  src/agent/loop.test.ts > executeAgentLoop > PTC (Story 6.3) > should clear status on result
 FAIL  src/tools/mcp/schema-converter.test.ts > mcpToolToClaude > should include allowed_callers
 FAIL  src/tools/mcp/schema-converter.test.ts > mcpToolToClaude > should set code_execution caller
 FAIL  src/slack/status-messages.test.ts > buildLoadingMessages > should return PTC status
 FAIL  src/slack/status-messages.test.ts > buildLoadingMessages > should handle PTC mode

Tests: 14 failed
```

**Summary:**

- Total tests: 14
- Passing: 0 (expected)
- Failing: 14 (expected)
- Status: RED phase verified

---

## Notes

- **Task 0 Validation Spike:** Per story, Task 0 validation spike MUST pass before full implementation. Consider running spike first.
- **SDK Type Check:** Verify if `@anthropic-ai/sdk` exports PTC types before creating custom types
- **GKE Sandbox Separate:** Story 6-2 sandbox handles Skills with network access; PTC uses Anthropic's container
- **Rollback Plan:** All changes additive — rollback by removing beta header + allowed_callers

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Tag @TEA Agent in Slack
- Refer to `_bmad/bmm/testarch/knowledge` for testing best practices

---

**Generated by BMad TEA Agent** - 2026-01-06
