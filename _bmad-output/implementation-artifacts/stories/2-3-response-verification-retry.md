# Story 2.3: Response Verification & Retry

Status: done

## Story

As a **user**,
I want Orion to verify responses before sending them,
So that I receive accurate, high-quality answers.

## Acceptance Criteria

1. **Given** the agent loop is implemented, **When** verification fails, **Then** the agent retries with feedback from verification

2. **Given** a retry is triggered, **When** the maximum attempts are reached, **Then** maximum 3 verification attempts before graceful failure (AR8)

3. **Given** all attempts fail, **When** the loop exhausts, **Then** a graceful failure response is returned to the user

4. **Given** verification is performed, **When** each verification completes, **Then** verification results are logged in Langfuse

5. **Given** verification is tracked, **When** analytics are reviewed, **Then** verification pass rate is tracked (target: >95%)

## Tasks / Subtasks

- [x] **Task 1: Enhance Verification Rules** (AC: #1)
  - [x] Update `src/agent/loop.ts` verification logic
  - [x] Add rules for factual claim detection
  - [x] Add rules for response coherence
  - [x] Add rules for source citation checking
  - [x] Return structured feedback for retry

- [x] **Task 2: Implement Verification Feedback Loop** (AC: #1, #2)
  - [x] Pass verification feedback to next attempt
  - [x] Include specific issues in retry prompt
  - [x] Track improvement across attempts
  - [x] Log attempt progression

- [x] **Task 3: Create Graceful Failure Response** (AC: #3)
  - [x] Create `createGracefulFailureResponse()` function
  - [x] Include helpful message explaining the failure
  - [x] Suggest alternative actions
  - [x] Format for Slack mrkdwn

- [x] **Task 4: Add Langfuse Verification Logging** (AC: #4)
  - [x] Log verification input and output in spans
  - [x] Track pass/fail status
  - [x] Log specific issues found
  - [x] Include attempt number

- [x] **Task 5: Add Verification Metrics** (AC: #5)
  - [x] Create `src/observability/metrics.ts`
  - [x] Track verification pass rate
  - [x] Track average attempts to pass
  - [x] Track failure reasons

- [x] **Task 6: Verification** (AC: all)
  - [x] Send message that triggers verification failure
  - [x] Verify retry occurs with feedback
  - [x] Verify graceful failure after 3 attempts
  - [x] Check Langfuse for verification metrics
  - [x] Verify pass rate tracking

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR8 | architecture.md | Maximum 3 verification attempts before graceful failure |
| FR2 | prd.md | System verifies responses before delivery and iterates |

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

### Metrics Tracking

```typescript
// src/observability/metrics.ts
interface VerificationMetrics {
  totalAttempts: number;
  passedFirstAttempt: number;
  passedAfterRetry: number;
  failedAllAttempts: number;
  issuesByType: Record<string, number>;
}

export function trackVerification(result: VerificationResult, attempt: number): void {
  // Log to Langfuse as custom event
  // Can be aggregated for dashboard
}
```

### References

- [Source: _bmad-output/epics.md#Story 2.3] — Original story
- [Source: _bmad-output/architecture.md#Verification Loop] — Verification pattern

### Previous Story Intelligence

From Story 2-2 (Agent Loop):
- `verifyResponse()` function exists
- Loop structure handles retries
- MAX_ATTEMPTS = 3 constant defined

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- Verification rules can be expanded over time based on failure patterns
- Consider LLM-as-Judge for semantic verification in future
- Track metrics to identify common verification failures
- Implemented 8 verification rules with error/warning severity levels
- Added improvement tracking across attempts (previousIssueCount)
- Enhanced Langfuse spans with detailed verification data
- Created metrics module with pass rate calculation
- All tests passing (259 tests, 0 regressions)

### File List

Files modified:
- `src/agent/loop.ts` - Enhanced verification rules, feedback loop, graceful failure, Langfuse logging
- `src/agent/loop.test.ts` - Added 20 new tests for Story 2.3 features

Files created:
- `src/observability/metrics.ts` - Verification metrics tracking
- `src/observability/metrics.test.ts` - Metrics module tests

### Change Log

- 2025-12-18: Implemented Story 2.3 - Response Verification & Retry
  - Task 1: Enhanced VERIFICATION_RULES with 8 rules (error/warning severity)
  - Task 2: Implemented feedback loop with improvement tracking
  - Task 3: Enhanced createGracefulFailureResponse with Slack mrkdwn
  - Task 4: Enhanced Langfuse verification logging with attempt/issue details
  - Task 5: Created metrics.ts for pass rate tracking
  - Task 6: Added integration tests verifying all ACs

