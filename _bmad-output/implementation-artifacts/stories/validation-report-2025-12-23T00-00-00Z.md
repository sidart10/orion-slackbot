# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/2-2-agent-loop-implementation.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** 2025-12-23

## Summary

- **Overall:** 2/10 passed (20%)
- **Critical Issues:** 5

## Section Results

### 1) Target Document Basics
Pass Rate: 2/2 (100%)

✓ PASS Story metadata exists (title + status + story + AC + tasks + dev notes)  
Evidence: Story header and sections are present at `2-2-agent-loop-implementation.md:L1-L25`.

✓ PASS Includes concrete implementation guidance (code + file paths)  
Evidence: Includes proposed `src/agent/loop.ts` and `src/agent/orion.ts` updates at `2-2-agent-loop-implementation.md:L120-L589`.

---

### 2) Alignment to Project Plan (Epics/PRD/Architecture)
Pass Rate: 0/4 (0%)

✗ FAIL Story 2.2 title/scope mismatch vs epic plan  
Evidence:
- Epic plan indicates **Story 2.2 = “Dynamic Status Messages” (FR47)**: `_bmad-output/epics.md:L437-L443`  
- This story is titled **“Agent Loop Implementation”**: `2-2-agent-loop-implementation.md:L1`  
Impact: High risk of sprint drift and “done-but-not-done” outcomes (team thinks FR47 is delivered when it is not).

✗ FAIL Reinvents the agent loop that already exists in code  
Evidence:
- Story proposes creating a new module `src/agent/loop.ts` + using `executeAgentLoop()` as the core loop: `2-2-agent-loop-implementation.md:L27-L33`  
- Story proposes updating `src/agent/orion.ts` to use `executeAgentLoop()`: `2-2-agent-loop-implementation.md:L69-L72`  
- Current implementation already has the **tool_use loop** in `src/agent/orion.ts` (iterates up to `MAX_TOOL_LOOPS`, processes `tool_use` blocks): `src/agent/orion.ts:L108-L203`  
Impact: Duplicate/conflicting “loop” implementations will cause regressions and confusion about the canonical execution path.

✗ FAIL Uses the wrong Anthropic SDK API surface (`query`) and conflicts with architecture decision  
Evidence:
- Story code imports `query` from `@anthropic-ai/sdk`: `2-2-agent-loop-implementation.md:L122-L126`  
- Architecture explicitly states **we are replacing** SDK `query()` with a custom `messages.create()` loop: `_bmad-output/architecture.md:L101-L110`  
Impact: Implementing `query()` would violate core architecture constraints and likely fail at runtime (or introduce divergent behavior).

✗ FAIL Proposes a “verification system” inconsistent with the platform’s agent-loop approach  
Evidence:
- PRD defines the agent loop as a `while (stop_reason === 'tool_use')` loop around `messages.create()` (with verification as part of the loop behavior): `_bmad-output/prd.md:L40-L41`  
- Story defines a separate GATHER→ACT→VERIFY pipeline with a rules-based verifier (not tool_use-driven): `2-2-agent-loop-implementation.md:L92-L118`, `2-2-agent-loop-implementation.md:L428-L478`  
Impact: Two competing models for “the loop” increases integration risk and breaks the single-source-of-truth architecture.

---

### 3) Disaster Prevention (Wheels, Libraries, File Layout, Regressions)
Pass Rate: 0/3 (0%)

✗ FAIL Wrong/ambiguous file layout guidance for existing codebase  
Evidence:
- Story says “Update `src/agent/orion.ts` to use `executeAgentLoop()`”: `2-2-agent-loop-implementation.md:L69-L72`  
- But current codebase already places the agent loop in `src/agent/orion.ts` and does not have `src/agent/loop.ts`: `src/agent/orion.ts:L1-L203` (and `src/agent/*loop*.ts` does not exist currently).  
Impact: High chance of creating a second entry point and diverging behavior between Slack handler → `runOrionAgent()` and any new loop module.

✗ FAIL Acceptance criteria requires searching `orion-context/`, but implementation stub returns empty results  
Evidence:
- AC expects gather phase searches `orion-context/`: `2-2-agent-loop-implementation.md:L15-L17`  
- `searchOrionContext()` is a TODO that always returns `[]`: `2-2-agent-loop-implementation.md:L346-L351`  
Impact: Fails “gather” contract; downstream response generation will not be grounded in file context as promised.

✗ FAIL Span naming conventions not aligned with the architecture’s documented standard  
Evidence:
- Architecture documents span naming pattern `{component}.{operation}` with examples like `agent.loop`, `tool.memory.view`: `_bmad-output/architecture.md:L543-L558`  
- Story uses names like `phase-gather`, `phase-act`, `phase-verify`: `2-2-agent-loop-implementation.md:L194-L235`  
Impact: Observability becomes inconsistent, dashboards/queries harder, and cross-story tracing conventions drift.

---

### 4) FR47 Dynamic Status Messages (Core of Story 2.2 per plan)
Pass Rate: 0/1 (0%)

✗ FAIL FR47 is referenced, but not actually implementable from the story as written  
Evidence:
- FR47 definition requires `setStatus({ status, loading_messages: [...] })`: `_bmad-output/architecture.md:L896-L912`  
- Story AC references FR47 status messages: `2-2-agent-loop-implementation.md:L23-L24`  
- Story tasks mention passing `setStatus` + `loading_messages`: `2-2-agent-loop-implementation.md:L62-L68`  
- But the provided `src/agent/loop.ts` code signature does not accept `setStatus` and does not call it anywhere: `2-2-agent-loop-implementation.md:L177-L279`  
Impact: Story is likely to ship without meeting FR47 (and the epic plan says 2.2 is *specifically* FR47).

---

### 5) Task List Quality & Dev Readiness
Pass Rate: 0/0 (0%) ➖ N/A (quality issues noted)

⚠ PARTIAL Task list is present but has correctness gaps that will confuse implementation  
Evidence:
- Task numbering skips **Task 8** (jumps from 7 → 9): `2-2-agent-loop-implementation.md:L69-L80`  
- ACT phase task says “Call Claude SDK” even though architecture/implementation uses **Direct Anthropic API**: `2-2-agent-loop-implementation.md:L41-L46` vs `_bmad-output/architecture.md:L68-L110`  
Impact: Increased implementation ambiguity and reviewer churn.

## Failed Items (✗) — Must Fix

1. Rename/re-scope Story 2.2 to match epic plan: **Dynamic Status Messages (FR47)**.  
2. Remove loop reinvention: do **not** introduce a second “agent loop” module that competes with `src/agent/orion.ts`.  
3. Remove incorrect Anthropic usage: no `query()`; align to `messages.create()` + tool_use loop per architecture.  
4. Make `orion-context/` gathering either real (implemented) or explicitly out of scope (and remove AC language).  
5. Align span naming to `{component}.{operation}` standard.

## Partial Items (⚠) — Should Improve

1. Replace brittle verification heuristics (e.g., checking for the substring `"source"`) with the project’s intended verification approach (prompt-driven verification in the loop).  
2. Fix task numbering and tighten language (“Direct Anthropic API” vs “Claude SDK”).

## Recommendations

1. **Must Fix (critical):**
   - Re-scope Story 2.2 to FR47 and provide a concrete implementation plan that wires `setStatus({ loading_messages })` through the tool execution path.
   - Remove/rewrite the proposed `executeAgentLoop()` module to avoid duplicating the already-existing tool-use loop in `src/agent/orion.ts`.
2. **Should Improve:**
   - Ensure types match actual code (`AgentContext.threadHistory` is currently `{role, content}[]`): `src/agent/orion.ts:L22-L31`.
   - Align spans to `agent.*` naming conventions.
3. **Consider:**
   - Reduce large inlined code blocks; instead reference existing modules and specify diffs (reduces divergence between story and repo).


