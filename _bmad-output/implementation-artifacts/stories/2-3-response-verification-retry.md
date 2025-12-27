# Story 2.3: Response Verification & Retry

Status: done

## Dependencies / Prerequisites

- **Story 2.1 must be complete**: `src/agent/orion.ts` exists and is the current agent entry point.
- **If Story 2.2 (Agent Loop) is implemented** and introduces `executeAgentLoop()` / `src/agent/loop.ts`, implement verification + retries in that loop and keep `src/agent/orion.ts` as the Anthropic transport wrapper.
- **Project “bible” rules apply**: `_bmad-output/project-context.md` (Slack mrkdwn, ESM `.js` imports, no PII in logs, include `traceId` in logs).

## Story

As a **user**,
I want Orion to verify responses before sending them,
So that I receive accurate, high-quality answers.

## Acceptance Criteria

1. **Given** Orion generates a candidate response, **When** verification fails, **Then** the agent retries with structured feedback from verification

2. **Given** Orion is streaming model output internally, **When** verification fails for an attempt, **Then** **unverified attempt content is never delivered to the user** (buffer → verify → only then stream to Slack)

3. **Given** a retry is triggered, **When** the maximum attempts are reached, **Then** maximum 3 verification attempts before graceful failure (AR8)

4. **Given** all attempts fail, **When** the loop exhausts, **Then** a graceful failure response is returned to the user in **Slack mrkdwn** format

5. **Given** verification is performed, **When** each verification attempt completes, **Then** verification results are logged in Langfuse **without logging PII or raw message content** (only lengths, flags, issue codes)

6. **Given** verification is tracked, **When** analytics are reviewed, **Then** verification metrics are available in Langfuse:
   - `verified_message_rate = verified_messages / total_messages` (rolling window, per environment)
   - `pass_on_first_attempt_rate = passed_on_attempt_1 / total_messages`
   - `avg_attempts_to_verify` (for verified messages only)
   - Target: `verified_message_rate > 95%`

## Tasks / Subtasks

- [x] **Task 1: Choose Implementation Target (Based on Repo State)** (AC: all)
  - [x] **If `src/agent/loop.ts` exists:** implement verification + retry loop there (canonical Gather → Act → Verify).
  - [x] **Else (current repo):** implement verification + retry around the existing streaming/tool loop in `src/agent/orion.ts`.

- [x] **Task 2: Implement Streaming-Safe Verification Gate** (AC: #2, #3, #4)
  - [x] Buffer each attempt's model output **in-memory** until verification passes
  - [x] Only after verification passes: yield/stream the buffered content to Slack
  - [x] If verification fails: discard buffered content for that attempt, retry with verification feedback
  - [x] Ensure max attempts = 3, then return graceful failure

- [x] **Task 3: Implement Verification Rules + Structured Feedback** (AC: #1)
  - [x] Create `src/agent/verification.ts` exporting `verifyResponse(...)` and `VerificationResult`
  - [x] Add rules for:
    - [x] Slack mrkdwn compliance (no `**bold**`, no blockquotes)
    - [x] Addresses question / coherence checks
    - [x] Citation presence when sources exist (placeholder until Story 2.7 defines citation format)
  - [x] Return structured feedback suitable for retry prompt injection (issue codes + human text)

- [x] **Task 4: Create Graceful Failure Response** (AC: #4)
  - [x] Create `createGracefulFailureResponse()` function
  - [x] Include helpful message explaining the failure
  - [x] Suggest alternative actions
  - [x] Format for Slack mrkdwn

- [x] **Task 5: Add Langfuse Verification Logging** (AC: #5, #6)
  - [x] Create span per attempt (recommended name: `agent.verify`)
  - [x] Log metadata only (no raw content): `{ attempt, passed, issueCodes, responseLength, userMessageLength }`
  - [x] Emit a Langfuse **event** `verification_result` for each attempt (for dashboards)
  - [x] Emit a Langfuse **event** `verification_exhausted` when all attempts fail
  - [x] Ensure all logs include `traceId` and contain no PII

- [x] **Task 6: Define Metric Collection Strategy (Langfuse-First)** (AC: #6)
  - [x] Use Langfuse events (no bespoke metrics sink required for MVP)
  - [x] Document which Langfuse dashboard queries compute:
    - `verified_message_rate`
    - `pass_on_first_attempt_rate`
    - `avg_attempts_to_verify`

- [x] **Task 7: Verification** (AC: all)
  - [x] Send message that triggers verification failure
  - [x] Verify retry occurs with feedback
  - [x] Verify graceful failure after 3 attempts
  - [x] Verify **no unverified attempt content** is ever delivered to Slack
  - [x] Check Langfuse for `verification_result` events and attempt spans
  - [x] Verify pass rate tracking (dashboard/query)

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR8 | architecture.md | Maximum 3 verification attempts before graceful failure |
| FR2 | prd.md | System verifies responses before delivery and iterates |

### Critical Implementation Constraint: Streaming vs Verify-Before-Send

The current Slack handler streams chunks as they are yielded by `runOrionAgent()` (`src/slack/handlers/user-message.ts`). To satisfy “verify before sending”, Orion must **buffer output per attempt**, run verification, and **only then** yield content to the Slack streamer.

Use Slack’s `setStatus(...)` updates for perceived progress while buffering.

### Enhanced Verification Rules

```typescript
interface VerificationRule {
  name: string;
  check: (response: string, input: string, context: GatheredContext) => boolean;
  feedback: string;
  severity: 'error' | 'warning';
}

const VERIFICATION_RULES: VerificationRule[] = [
  {
    name: 'not_empty',
    check: (r) => r.trim().length > 0,
    feedback: 'Response cannot be empty',
    severity: 'error',
  },
  {
    name: 'minimum_length',
    check: (r, i) => r.length >= Math.min(i.length, 50),
    feedback: 'Response is too short for the question',
    severity: 'warning',
  },
  {
    name: 'no_markdown_bold',
    check: (r) => !/\*\*[^*]+\*\*/.test(r),
    feedback: 'Use Slack mrkdwn (*bold*) not markdown (**bold**)',
    severity: 'error',
  },
  {
    name: 'no_blockquotes',
    check: (r) => !/^>/m.test(r),
    feedback: 'Do not use blockquotes, use bullet points instead',
    severity: 'error',
  },
  {
    name: 'addresses_question',
    check: (r, i) => {
      const keywords = extractKeywords(i);
      const responseWords = r.toLowerCase();
      return keywords.some(k => responseWords.includes(k));
    },
    feedback: 'Response does not appear to address the question',
    severity: 'warning',
  },
  {
    name: 'cites_sources',
    check: (r, _, ctx) => {
      if (ctx.relevantSources.length === 0) return true;
      return /source|reference|from|according/i.test(r);
    },
    feedback: 'Context was gathered but sources are not cited',
    severity: 'warning',
  },
];
```

### Graceful Failure Response Template

```typescript
function createGracefulFailureResponse(
  input: string,
  context: AgentContext
): AgentResponse {
  const reasons = [
    'The question requires information I don\'t have access to',
    'I need more context to provide an accurate answer',
    'The verification checks couldn\'t be satisfied',
  ];

  return {
    content: `I apologize, but I wasn't able to provide a verified response after ${MAX_ATTEMPTS} attempts.\n\n` +
      `*Possible reasons:*\n` +
      reasons.map(r => `• ${r}`).join('\n') +
      `\n\n*Suggestions:*\n` +
      `• Try rephrasing your question\n` +
      `• Provide more specific details\n` +
      `• Break down complex questions into smaller parts`,
    sources: [],
    verified: false,
    attemptCount: MAX_ATTEMPTS,
  };
}
```

### Langfuse Event Schema (for Metrics)

- Event name: `verification_result`
  - metadata: `{ traceId, attempt, passed, issueCodes, responseLength, userMessageLength }`
- Event name: `verification_exhausted`
  - metadata: `{ traceId, maxAttempts: 3, finalIssueCodes }`

### Metrics Tracking (Langfuse-First)

```typescript
// Implement as Langfuse events first; dashboards compute rates from events.
// Avoid storing raw message content; log lengths and issue codes only.
```

### References

- [Source: _bmad-output/epics.md#Story 2.3] — Original story
- [Source: _bmad-output/architecture.md#Verification Loop] — Verification pattern

### Previous Story Intelligence

From current repo state:
- Agent transport + tool loop lives in `src/agent/orion.ts`
- Slack streaming happens in `src/slack/handlers/user-message.ts` via `SlackStreamer`
- Langfuse helpers available via `startActiveObservation()` and `createSpan()` in `src/observability/tracing.ts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (claude-sonnet-4-20250514)

### Implementation Plan

1. Identified `src/agent/loop.ts` as the implementation target (Story 2.2 completed)
2. Created `src/agent/verification.ts` with 7 verification rules (empty, min length, markdown bold, markdown link, blockquote, addresses question, cites sources)
3. Modified `src/agent/loop.ts` to buffer per attempt, verify, retry with feedback, and yield only verified content
4. Added Langfuse events for verification tracking (no PII)
5. Documented SQL queries for computing verification metrics in Langfuse

### Completion Notes List

- Implemented buffer → verify → yield pattern in `executeAgentLoop()` (AC#2)
- Verification retry loop with max 3 attempts (AR8, AC#3)
- Structured feedback injected into retry prompts (AC#1)
- Graceful failure response in Slack mrkdwn format (AC#4)
- Langfuse events `verification_result` and `verification_exhausted` emitted via `getLangfuse().event()` (AC#5)
- SQL query documentation for metrics in verification.ts JSDoc (AC#6)
- All 258 tests pass, no regressions
- Verification rules can be expanded over time based on failure patterns
- Consider LLM-as-Judge for semantic verification in future

### Code Review Fixes (2025-12-23)

- Added missing `getLangfuse().event()` calls for `verification_result` and `verification_exhausted` (AC#5 was incorrectly marked complete)
- Added explicit return types to inline functions to resolve 5 ESLint warnings
- Added 2 tests for Langfuse event emission coverage

### File List

Files modified:
- `src/agent/loop.ts` — Buffer per attempt, retry loop, yield only verified output, Langfuse events
- `src/agent/loop.test.ts` — 11 tests total (4 verification retry + 2 Langfuse event tests)

Files created:
- `src/agent/verification.ts` — Verification rules, graceful failure, retry prompt builder
- `src/agent/verification.test.ts` — 24 comprehensive tests for verification module

## Change Log

- 2025-12-23 — Story implemented: verification retry loop with buffer-before-yield, Langfuse events, graceful failure
- 2025-12-23 — Code review fixes: Added `verification_result` and `verification_exhausted` Langfuse events (AC#5), added explicit return types to fix ESLint warnings, added 2 tests for Langfuse event emission

