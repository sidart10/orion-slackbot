# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/3-3-tool-execution-error-handling.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** 2025-12-23T02-51-13Z

## Summary

- **Overall**: 8/22 passed (36%)
- **Critical Issues**: 6

This story is directionally correct (timeout/retry/tool_result) but has several **high-risk mismatches** with the current repo and canonical patterns (Langfuse API usage, folder structure, and “never throw” semantics). These gaps are likely to cause wheel-reinvention, wrong file placement, and implementation regressions.

## Section Results

### 1) Load & Understand the Target

Pass Rate: 4/7 (57%)

[✓ PASS] Story has clear scope, ACs, and tasks  
Evidence: Story + ACs are explicit and mapped to tasks (`3-3-tool-execution-error-handling.md` L5-L67).

[✓ PASS] References key constraints (timeout, retries, ToolResult)  
Evidence: Timeout NFR21, retries max 3, ToolResult guidance (`3-3-tool-execution-error-handling.md` L13-L25, L70-L80).

[⚠ PARTIAL] Uses the right *concepts* but mismatched *types* vs current codebase  
Evidence: Story references `ErrorCode` + `src/types/*` (`3-3-tool-execution-error-handling.md` L92-L113) but current repo defines `ToolErrorCode` in `src/utils/tool-result.ts` (`src/utils/tool-result.ts` L9-L29).
Impact: Developer may introduce a second, competing error-code system.

[✗ FAIL] Langfuse API usage does not match current implementation  
Evidence: Story imports `langfuse` singleton and calls `langfuse.span(...)` (`3-3-tool-execution-error-handling.md` L122-L156). Current code exposes `getLangfuse()` returning a client where spans are created via `trace(...).span(...)`, and no `langfuse` singleton export exists (`src/observability/langfuse.ts` L30-L39, L85-L122).
Impact: Immediate compile errors + drift from observability patterns; likely rework during implementation.

[⚠ PARTIAL] File layout guidance is plausible *architecturally* but currently conflicts with repo layout  
Evidence: Story proposes creating `src/tools/*` and `src/types/*` (`3-3-tool-execution-error-handling.md` L83-L95) but those folders do not exist today (current `src/` tree contains `src/agent/*`, `src/utils/*`, `src/observability/*`).
Impact: This is acceptable if Epic 3 intentionally introduces `src/tools/`, but story should explicitly state this migration/creation is expected in 3.x.

[✓ PASS] Provides integration point with agent loop tool_use blocks  
Evidence: Includes a concrete “Integration with Agent Loop” snippet (`3-3-tool-execution-error-handling.md` L403-L430).

[✗ FAIL] Uses “never throw” language but includes internal throwing patterns without clarifying boundaries  
Evidence: Story states “Always return ToolResult — never throw” (`3-3-tool-execution-error-handling.md` L138-L139, L234-L238) yet `withRetry` throws and `withTimeout` rejects (`3-3-tool-execution-error-handling.md` L348-L349, L358, L303-L307).
Impact: Confusing contract; implementers may accidentally let exceptions escape tool execution into the agent loop.

### 2) Source Document Alignment (Epics / PRD / Architecture / Project Context)

Pass Rate: 3/6 (50%)

[✓ PASS] Epic alignment is correct  
Evidence: Epic 3 scope includes tool execution + FR39 and NFR21 (`_bmad-output/epics.md` L276-L291; `3-3-tool-execution-error-handling.md` L70-L80).

[✓ PASS] PRD alignment for tool timeout + retries exists  
Evidence: PRD requires tool timeout and exponential backoff (`_bmad-output/prd.md` L611-L613, L622-L623). Story encodes those in ACs and task plan (`3-3-tool-execution-error-handling.md` L13-L40).

[⚠ PARTIAL] Project-context “Tool errors: never throw; return ToolResult” is referenced, but story’s internal helpers contradict the promise  
Evidence: Project-context requires ToolResult and no exceptions from tools (`_bmad-output/project-context.md` L18-L19, L68-L91). Story’s `withRetry` throws + `withTimeout` rejects (`3-3-tool-execution-error-handling.md` L343-L358, L303-L307).
Impact: Risk of unhandled rejections or tool-executor leaking exceptions.

[⚠ PARTIAL] Max retries rule is consistent, but wording is slightly ambiguous (attempts vs retries)  
Evidence: Project-context: “Max retries per tool: 3” (`_bmad-output/project-context.md` L223-L224). Story says “max 3 attempts” (`3-3-tool-execution-error-handling.md` L17-L18, L37-L38).
Impact: Off-by-one bug risk unless clarified.

[✗ FAIL] Story doesn’t reconcile with the *current* implemented tool_use stub behavior  
Evidence: Current agent loop stubs tool execution with `TOOL_NOT_IMPLEMENTED` (`src/agent/orion.ts` L181-L202), and tool definitions are currently empty (`src/agent/tools.ts` L32-L35). Story doesn’t specify how/where this executor will be invoked relative to the existing stub.
Impact: Developer may implement executor in isolation and forget to wire it into `runOrionAgent`.

[✗ FAIL] Error code set in story exceeds current canonical ToolErrorCode set  
Evidence: Story introduces codes like `RATE_LIMITED`, `MCP_CONNECTION_FAILED` (`3-3-tool-execution-error-handling.md` L101-L110) while current `ToolErrorCode` union is smaller (`src/utils/tool-result.ts` L9-L13).
Impact: Type drift; forces refactor or ad-hoc casts.

### 3) Disaster Prevention Gap Analysis

Pass Rate: 1/6 (17%)

[✗ FAIL] Reinvention prevention: story doesn’t explicitly call out existing `src/utils/tool-result.ts` and `isRetryable()` helper  
Evidence: Existing helper exists (`src/utils/tool-result.ts` L31-L48). Story proposes new `src/tools/errors.ts` + `isTransientError()` (`3-3-tool-execution-error-handling.md` L42-L47, L361-L388).
Impact: Duplicate classifiers + inconsistent retry behavior across tools.

[✗ FAIL] Wrong-library / wrong-API risk: Langfuse usage mismatch (see Section 1)  
Impact: Guaranteed compile/runtime divergence.

[⚠ PARTIAL] File-structure disaster prevention is present but not grounded in *current* repo  
Evidence: Story provides a clear layout (`3-3-tool-execution-error-handling.md` L83-L95), but current repo’s tool-related code lives under `src/agent/*` and `src/utils/*`.
Impact: If Epic 3 introduces `src/tools/`, story must explicitly state “you will create this folder in Epic 3”.

[✓ PASS] Regression prevention via explicit tests and fake-timer strategy  
Evidence: Includes `executor.test.ts` with key cases (timeouts, 429 backoff, retry policy) (`3-3-tool-execution-error-handling.md` L456-L536).

[✗ FAIL] “Timeout wrapper” example doesn’t actually pass `AbortSignal` into the underlying tool call  
Evidence: `AbortController` is created but never forwarded into `fn()` or router call (`3-3-tool-execution-error-handling.md` L292-L312, L166-L169).
Impact: Timeouts may not cancel in-flight requests; leaks resources and violates the intended NFR.

[✗ FAIL] “Returns ToolResult on timeout — never throws” is contradicted by implementation  
Evidence: Comment claims no throw (`3-3-tool-execution-error-handling.md` L288-L291) but code rejects with `TimeoutError` (`3-3-tool-execution-error-handling.md` L303-L307).
Impact: Misleads implementer; increases risk of uncaught errors.

### 4) LLM-Dev-Agent Optimization (Token Efficiency & Clarity)

Pass Rate: 0/2 (0%)

[✗ FAIL] Contains misleading code that won’t compile against current repo (Langfuse + types paths)  
Evidence: `langfuse.span` call (`3-3-tool-execution-error-handling.md` L151-L156) conflicts with actual API (`src/observability/langfuse.ts` L19-L28, L85-L122).

[✗ FAIL] Multiple internal inconsistencies (documented “never throw” vs helpers that throw/reject)  
Evidence: See Section 1 and 3.

### 5) Improvement Recommendations

Pass Rate: 0/1 (0%)

[✗ FAIL] Story does not provide a “do-not-reinvent” checklist tied to existing code  
Evidence: No explicit “reuse `src/utils/tool-result.ts` and integrate into `src/agent/orion.ts` tool_use loop” guidance.

## Failed Items (✗) — Recommendations

1) **Align Langfuse usage to current code**
- Replace `langfuse.span(...)` with `const lf = getLangfuse(); const trace = lf?.trace(...); const span = trace?.span(...)`.
- Or update `src/observability/langfuse.ts` to export a true singleton named `langfuse` if that’s the desired pattern. Pick ONE and standardize.

2) **Clarify “never throw” contract**
- Update story to state: “Internal helpers may throw; `executeTool()` must catch everything and return `ToolResult`.”
- Or refactor examples so helpers *never throw* (return `ToolResult` consistently) to match the stated contract.

3) **Ground file locations in current repo**
- If Epic 3 is introducing `src/tools/`, explicitly say so (and note migration/wiring points).
- Otherwise, update story paths to current structure (`src/agent/*`, `src/utils/tool-result.ts`, `src/observability/langfuse.ts`).

4) **Make timeouts real (AbortSignal propagation)**
- `withTimeout` should accept an `AbortSignal` (or create one) and pass it down to router/MCP calls.
- Ensure MCP client uses fetch with `signal`, and any long-running promise respects cancellation.

5) **Unify error codes**
- Either expand `src/utils/tool-result.ts` codes to include `RATE_LIMITED`, `MCP_CONNECTION_FAILED`, etc., or constrain story to the currently supported set.
- Avoid introducing both `ToolErrorCode` and `ErrorCode` unless the repo is explicitly evolving toward `src/types/errors.ts`.

6) **Explicitly describe wiring into current agent loop**
- Add a “Wiring Plan” subtask that replaces the current stub tool_result in `src/agent/orion.ts` with real execution once registry/router exists.

## Partial Items (⚠) — What’s Missing

- **Attempts vs retries semantics**: clarify whether “3 attempts” means 1 initial + 2 retries, or 3 retries after initial.
- **Story-to-repo transition**: explain whether Epic 3 includes creating `src/tools/` and `src/types/` from scratch.

## Recommendations (Prioritized)

1. **Must Fix**
   - Langfuse API mismatch (compile-breaking)
   - Timeout implementation contradiction + missing abort propagation
   - “Never throw” inconsistency in examples
2. **Should Improve**
   - File path alignment with current repo (or explicitly declare directory creation as part of Epic 3)
   - Error code unification plan
3. **Consider**
   - Reuse/extend existing `isRetryable()` rather than creating another classifier
   - Add a short “Existing Code Touchpoints” section (current `src/agent/orion.ts` tool stub, `src/utils/tool-result.ts`, `src/observability/langfuse.ts`)


