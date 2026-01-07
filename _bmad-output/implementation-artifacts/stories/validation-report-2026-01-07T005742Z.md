# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/6-3-anthropic-managed-ptc.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** 2026-01-07T005742Z

## Summary
- Overall: **11/20 passed (55%)**
- **Critical Issues:** 5

## Section Results

### 1) Core alignment with primary artifacts
Pass Rate: 4/5 (80%)

✓ **Scope matches approved sprint change proposal (tasks + ACs expanded)**
Evidence:
- Story defines Task 0 validation gate and expanded AC7-AC10 (`L59-L70`, `L48-L53` in the story).
- Approved proposal defines the same validation spike + AC7-AC10 (`L73-L88`, `L200-L227` in `_bmad-output/sprint-change-proposal-2026-01-06.md`).

✓ **PTC vs GKE sandbox separation is correct**
Evidence:
- Story: “PTC uses Anthropic's container … no network” and GKE sandbox still needed (`L29-L34` in the story).
- Project context confirms Anthropic container has no network; GKE sandbox provides network (`L346-L387` in `_bmad-output/project-context.md`).
- Architecture ADR also states “Anthropic's code execution container has NO network access” (`L321-L329` in `_bmad-output/architecture.md`).

✓ **Anthropic SDK version is consistent with project constraints**
Evidence:
- Story dependencies include `@anthropic-ai/sdk ^0.71.x` (`L12` in the story).
- Project context lists `@anthropic-ai/sdk ^0.71.x` (`L36-L42` in `_bmad-output/project-context.md`).

✓ **Rollback plan is explicitly additive**
Evidence:
- Story rollback is clear and additive (`L331-L337` in the story).
- Proposal also frames the changes as additive rollback (`L290-L297` in `_bmad-output/sprint-change-proposal-2026-01-06.md`).

⚠ **Token savings claim is plausible but not operationalized**
Evidence:
- Story claims ~37% savings (`L7-L8`, `L46` in the story) and proposes rough estimator (`L282-L291` in the story).
Impact: Without an agreed measurement method (baseline prompt, tool payload sizing, “chars per token” calibration), “37%” could be reported inconsistently across runs.

---

### 2) Critical mistakes to prevent (checklist “disaster prevention”)
Pass Rate: 3/8 (38%)

⚠ **Reinventing wheels / reuse guidance**
Evidence:
- Story references prior learnings + patterns (“Story 6-2 Learnings”, “Recent Commits Context”) (`L312-L323` in the story).
Gap: It does not explicitly point to the *actual* current implementation locations for tool definitions, Anthropic betas/header config, or Slack status messages (see failures below).
Impact: High risk a dev implements duplicate/parallel logic in the wrong layer.

✓ **Wrong libraries / versions**
Evidence:
- Uses correct SDK (`@anthropic-ai/sdk`) and correct beta header names in story text (`L12`, `L41-L43`, `L74-L86` in the story).

✗ **Wrong file locations (multiple concrete mismatches)**
Evidence:
- Story claims key file `src/slack/utils/status-messages.ts` (`L11` in the story), but the repo uses `src/slack/status-messages.ts` (file exists) and imports it from handlers (`src/slack/handlers/user-message.ts` imports `../status-messages.js`, shown by grep results).
- The actual status message builder is `buildLoadingMessages()` (`L108-L157` in `src/slack/status-messages.ts`), not `getToolStatusMessage()` as suggested by the story (`L248-L260` in the story).
Impact: A dev will edit/create the wrong file and miss the real runtime hook used by Slack handlers.

✗ **Wrong integration point for betas + tool list**
Evidence:
- Story says “Add betas array + code_execution tool in `src/agent/orion.ts`” (`L72-L88` in the story).
- In the repo, `src/agent/orion.ts` is a wrapper around `executeAgentLoop` and does not call Anthropic (`L110-L176` in `src/agent/orion.ts`).
- Anthropic beta header is currently set via `defaultHeaders: { 'anthropic-beta': 'context-management-2025-06-27' }` in `src/agent/loop.ts` (`L117-L124` in `src/agent/loop.ts`).
- Tool definitions are assembled inside the loop via `getToolDefinitions()` (`L453-L465` in `src/agent/loop.ts`).
Impact: A dev following the story will implement changes in a module that won’t affect runtime behavior.

✗ **Wrong type extension target for “ToolDefinition”**
Evidence:
- Story instructs “Extend ToolDefinition type … File: `src/tools/mcp/types.ts`” (`L90-L97` in the story).
- Actual `ToolDefinition` alias is `export type ToolDefinition = Anthropic.Tool;` in `src/agent/tools.ts` (`L17-L31` in `src/agent/tools.ts`).
Impact: Type changes in MCP types won’t affect Anthropic tool schema typing and will mislead future maintainers.

⚠ **Breaking regressions / safety checks**
Evidence:
- Story includes rollback plan (`L331-L337` in the story).
Gap: It does not explicitly call out the project “no global mutable state” rule when proposing container reuse via `this.activeContainer` (snippet suggests class-level state) (`L188-L198` in the story) vs project context “NO global mutable state” (`L279-L282` in `_bmad-output/project-context.md`).
Impact: Risk of unsafe cross-request container reuse or concurrency bugs if implemented as global/module state.

✓ **Vague implementations avoided**
Evidence:
- Tasks are broken down with concrete file touch list and code snippets (`L57-L291`, `L409-L419` in the story).

---

### 3) Workflow completeness & testability
Pass Rate: 3/4 (75%)

✓ **Validation spike as a hard gate is clear**
Evidence:
- “Task 0 … CRITICAL GATE … If validation fails, STOP and revise architecture” (`L59-L68` in the story).

⚠ **Test harness location is good, but story omits current test utilities**
Evidence:
- Proposed test file location `tests/integration/ptc-validation-spike.test.ts` (`L70` in the story).
- Repo uses `tests/integration/` for integration tests (documented in architecture’s structure section `L1043-L1047` in `_bmad-output/architecture.md`).
Gap: Story doesn’t reference existing integration patterns/helpers in `tests/` that could accelerate the spike.

✓ **Unit tests suggested for message formatting and error logging**
Evidence:
- Unit test suggestions for PTC formatting/error handling are explicitly listed (`L343-L379` in the story).

✓ **Acceptance criteria are testable**
Evidence:
- Each AC is framed as Given/When/Then and corresponds to observable states or message shapes (`L41-L53` in the story).

---

### 4) Observability & UX (FR47 alignment)
Pass Rate: 1/3 (33%)

✗ **Slack status message integration guidance is incorrect**
Evidence:
- Story instructs editing `src/slack/utils/status-messages.ts` and adding `getToolStatusMessage()` (`L242-L260` in the story).
- Actual production hook is `buildLoadingMessages()` in `src/slack/status-messages.ts` (`L108-L157` in `src/slack/status-messages.ts`).
Impact: The intended “Running multi-tool analysis…” UX will not show up if implemented per the story.

⚠ **Status update trigger is plausible but needs to match current loop’s status API**
Evidence:
- Story wants status update on `server_tool_use` receipt (`L124-L133` in the story).
- Current loop status updates occur on phase transitions and on tool execution start using `options.setStatus` (`L466`, `L770-L778` in `src/agent/loop.ts`).
Gap: The story needs to explicitly integrate with the existing `phase/toolName/toolInput/allTools` status contract.

✓ **Langfuse metric additions are directionally consistent**
Evidence:
- Loop already emits Langfuse events (e.g. `verification_result`) (`L1011-L1025` in `src/agent/loop.ts`).
- Story’s proposed `ptc_execution_completed` event follows same pattern (`L270-L281` in the story).

---

### 5) MCP + allowed_callers wiring
Pass Rate: 0/2 (0%)

✗ **“Add allowed_callers” location is wrong for this codebase**
Evidence:
- Story says “Modify listTools() to add allowed_callers … File: `src/tools/mcp/discovery.ts`” (`L98-L112` in the story).
- In the repo, tool objects are created via `mcpToolToClaude()` in `src/tools/mcp/schema-converter.ts` (`L61-L103` in `src/tools/mcp/schema-converter.ts`) and registered via `toolRegistry.registerMcpTools(...)` (`L125-L133` in `src/tools/mcp/discovery.ts`).
Impact: Implementing allowed_callers in the wrong spot risks not being applied to the emitted Anthropic tool definitions.

✗ **Tool schema type compatibility not addressed**
Evidence:
- Current MCP-to-Anthropic tool type is a custom `AnthropicTool` interface (`L16-L24` in `src/tools/mcp/schema-converter.ts`), which currently lacks `allowed_callers`.
Impact: A dev will likely need to extend types (locally or via casting) and ensure runtime payload includes the beta field; the story doesn’t mention this type-level step in the right place.

---

## Failed Items (Recommendations)
1. **Fix file paths & integration points**
   - Update story to reference:
     - `src/agent/loop.ts` for beta header configuration (`defaultHeaders['anthropic-beta']`) and tool list assembly.
     - `src/agent/tools.ts` / `toolRegistry.getToolsForClaude()` for tool definitions (where to append `{ type: 'code_execution' }`).
     - `src/slack/status-messages.ts` and its `buildLoadingMessages()` API for the UX message (“Running multi-tool analysis…”).
2. **Clarify container reuse without global state**
   - Replace `this.activeContainer` guidance with “store container ID within `executeAgentLoop` scope and pass to subsequent Anthropic calls during the same agent loop execution.”
3. **Move allowed_callers implementation guidance**
   - Point to `src/tools/mcp/schema-converter.ts` (or wherever the Anthropic tool JSON is produced) as the correct place to add `allowed_callers: ['code_execution_20250825']`.

## Partial Items (What’s missing)
- **Token savings measurement**: add an explicit measurement protocol (baseline prompt, sample query set, how to compare “with/without PTC”).
- **Test harness reuse**: reference existing integration test helpers/patterns to avoid bespoke harness code.

## Recommendations
1. **Must Fix**
   - Correct the story’s file references and integration points (loop/tools/status messages/ToolDefinition).
2. **Should Improve**
   - Add explicit “no global state” implementation pattern for container reuse.
   - Define a clear measurement approach for token savings.
3. **Consider**
   - Add a short “Where to implement each task in this repo” mapping table to prevent dev mistakes.


