# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/2-6-context-compaction.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** 2025-12-23

## Summary

- **Overall:** 3/10 passed (30%)
- **Critical Issues:** 5

## Section Results

### 1) Source alignment (PRD/Epics/Architecture) & requirement IDs

Pass Rate: 0/3 (0%)

✗ FAIL — **Correct NFR references (no stale IDs)**
Evidence:
- Story claims “200k token limit … (NFR24)”:
  - `2-6-context-compaction.md` L13: “When the 200k token limit is approached (NFR24)”
- Current epics list **NFR28** (not NFR24) for large-context + compaction:
  - `_bmad-output/epics.md` L132: “NFR28: Large context window model with compaction for long threads”
Impact: Stale IDs break traceability; dev agent may implement to the wrong/nonexistent NFR.

✗ FAIL — **Correct architecture requirement IDs**
Evidence:
- Story claims compaction trigger is “(AR30)”:
  - `2-6-context-compaction.md` L13: “Then Anthropic API compaction is triggered (AR30)”
- Search for `AR30` in `_bmad-output/architecture.md` returned **no matches**.
Impact: Architecture linkage is unverifiable; “AR30” appears stale or misnumbered.

✗ FAIL — **Context window described as model-dependent (not hardcoded)**
Evidence:
- PRD states context window is **model-dependent**, compaction manages long threads:
  - `_bmad-output/prd.md` L632: “Context window | Model-dependent | Use a model with a large context window; compaction manages long threads”
- Story hardcodes a “200k token limit”:
  - `2-6-context-compaction.md` L13: “200k token limit”
Impact: Implementation may silently break when model changes or limits differ.

### 2) Repo fit (files, functions, and avoiding wheel reinvention)

Pass Rate: 1/3 (33%)

✗ FAIL — **File references match current repo structure**
Evidence:
- Story instructs modifying `src/agent/loop.ts`:
  - `2-6-context-compaction.md` L136-L139: “loop.ts … Updated to check compaction before API call”
- Current repo has agent loop in `src/agent/orion.ts` and **no** `src/agent/loop.ts`:
  - `src/agent/orion.ts` L85-L89: `export async function* runOrionAgent(...)`
Impact: Dev agent will waste time chasing non-existent files and may implement in wrong place.

⚠ PARTIAL — **Avoid duplicating existing helpers**
Evidence:
- Story proposes `estimateTokenCount()`:
  - `2-6-context-compaction.md` L78-L81: `export function estimateTokenCount(text: string): number { ... }`
- Repo already has `estimateTokens()` for the same purpose:
  - `src/agent/orion.ts` L229-L244: `export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }`
Impact: Duplicate token estimators cause drift and inconsistent compaction behavior.

✓ PASS — **Slack thread-history source is consistent**
Evidence:
- Story references `fetchThreadHistory()` from Story 2-5:
  - `2-6-context-compaction.md` L155-L158
- Repo includes `fetchThreadHistory()`:
  - `src/slack/thread-context.ts` L54-L61
Impact: None.

### 3) Technical correctness & safety (config, models, limits, SDK usage)

Pass Rate: 1/3 (33%)

✗ FAIL — **No hardcoded model names; use config**
Evidence:
- Story hardcodes model:
  - `2-6-context-compaction.md` L103-L104: `model: 'claude-sonnet-4-20250514'`
- Project bible explicitly forbids hardcoding model names:
  - `_bmad-output/project-context.md` L369-L370: “Hardcode model names | Use `config.anthropic.model`”
Impact: Violates model-switching NFRs and makes rollouts brittle.

⚠ PARTIAL — **Token limit handling is compatible with “model-dependent” context**
Evidence:
- Story hardcodes `TOKEN_LIMIT = 200_000`:
  - `2-6-context-compaction.md` L71-L76
- Repo already relies on real usage post-call:
  - `src/agent/orion.ts` L152-L154: `finalMessage.usage?.input_tokens`
- Repo bible: “Hardcode token limits | Read from API response”:
  - `_bmad-output/project-context.md` L372-L373
Impact: Hardcoding may over/under-trigger compaction; may break when model changes.

✓ PASS — **Compaction is placed before `messages.create()` (correct seam)**
Evidence:
- Repo bible: compaction should run **before** API call:
  - `_bmad-output/project-context.md` L228: “Run context compaction BEFORE `messages.create()`, not after”
- Story explicitly states compaction check happens before `messages.create()`:
  - `2-6-context-compaction.md` L161-L163
Impact: None.

### 4) Observability & logging (Langfuse + traceId)

Pass Rate: 1/1 (100%)

✓ PASS — **Compaction events will be traced**
Evidence:
- Story requires Langfuse logging:
  - `2-6-context-compaction.md` L21-L22, L47-L51
- Repo already uses spans/traces in handler:
  - `src/slack/handlers/user-message.ts` L88-L106, L134-L140, L187-L192
Impact: Low.

### 5) Testability (clear, repo-native tests)

Pass Rate: 1/2 (50%)

⚠ PARTIAL — **Concrete verification steps exist**
Evidence:
- Story lists simulation/verification tasks:
  - `2-6-context-compaction.md` L53-L57
Impact: Missing repo-native specifics (Vitest test cases, what to mock, expected spans/metrics).

✗ FAIL — **Missing explicit unit/integration test additions**
Evidence:
- Repo uses Vitest heavily (e.g., `src/slack/thread-context.test.ts`).
- Story does not specify adding `compaction.test.ts` or updating existing tests beyond a generic “simulate long conversation”.
Impact: Increases regression risk and makes compaction behavior unverified.

## Failed Items (✗) — Recommendations

1) **Fix stale requirement IDs and sources**
- Replace `NFR24` with the correct NFR (`NFR28` per `_bmad-output/epics.md` L132).
- Replace/remove `AR30` unless you can point to an actual architecture requirement ID; otherwise cite the relevant “Context Management / compaction” section instead.

2) **Correct file targets to match repo**
- Replace references to `src/agent/loop.ts` with `src/agent/orion.ts` (actual loop).
- Replace `formatThreadContext()` with `formatThreadHistoryForContext()` (actual name).

3) **Remove hardcoded model + avoid hardcoded context limits**
- Use `config.anthropicModel` for the summarization call.
- Replace `TOKEN_LIMIT = 200_000` with a model-aware strategy:
  - Use preflight estimate (`estimateTokens`) to trigger compaction heuristically, and/or
  - Use observed `finalMessage.usage` to tune thresholds for next turn.

4) **Add explicit tests**
- Add `src/agent/compaction.test.ts` (unit) for:
  - threshold logic
  - “preserve last N messages”
  - summary prompt shape
- Add/update integration test ensuring compaction span is created and message flow remains uninterrupted.

## Partial Items (⚠) — What’s Missing

- Consolidate token estimation to **one** helper (`estimateTokens`) to prevent drift.
- Clarify compaction policy relative to existing `fetchThreadHistory()` limits (currently capped by message count and token estimate).

## Must Fix / Should Improve / Consider

1. **Must Fix**
   - Stale requirement IDs (`NFR24`, `AR30`)
   - Wrong file target (`src/agent/loop.ts`)
   - Hardcoded model name
2. **Should Improve**
   - Token-limit strategy (model-dependent, avoid hardcoding)
   - Avoid duplicate token-estimation helpers
3. **Consider**
   - Tighten Langfuse span naming to existing conventions (e.g., `agent.compaction`)


