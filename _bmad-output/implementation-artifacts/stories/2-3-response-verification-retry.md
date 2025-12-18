# Story 2.3: Response Verification & Retry

Status: ready-for-dev

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

- [ ] **Task 1: Enhance Verification Rules** (AC: #1)
  - [ ] Update `src/agent/loop.ts` verification logic
  - [ ] Add rules for factual claim detection
  - [ ] Add rules for response coherence
  - [ ] Add rules for source citation checking
  - [ ] Return structured feedback for retry

- [ ] **Task 2: Implement Verification Feedback Loop** (AC: #1, #2)
  - [ ] Pass verification feedback to next attempt
  - [ ] Include specific issues in retry prompt
  - [ ] Track improvement across attempts
  - [ ] Log attempt progression

- [ ] **Task 3: Create Graceful Failure Response** (AC: #3)
  - [ ] Create `createGracefulFailureResponse()` function
  - [ ] Include helpful message explaining the failure
  - [ ] Suggest alternative actions
  - [ ] Format for Slack mrkdwn

- [ ] **Task 4: Add Langfuse Verification Logging** (AC: #4)
  - [ ] Log verification input and output in spans
  - [ ] Track pass/fail status
  - [ ] Log specific issues found
  - [ ] Include attempt number

- [ ] **Task 5: Add Verification Metrics** (AC: #5)
  - [ ] Create `src/observability/metrics.ts`
  - [ ] Track verification pass rate
  - [ ] Track average attempts to pass
  - [ ] Track failure reasons

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Send message that triggers verification failure
  - [ ] Verify retry occurs with feedback
  - [ ] Verify graceful failure after 3 attempts
  - [ ] Check Langfuse for verification metrics
  - [ ] Verify pass rate tracking

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

{{agent_model_name_version}}

### Completion Notes List

- Verification rules can be expanded over time based on failure patterns
- Consider LLM-as-Judge for semantic verification in future
- Track metrics to identify common verification failures

### File List

Files to modify:
- `src/agent/loop.ts` (enhance verification)

Files to create:
- `src/observability/metrics.ts`

