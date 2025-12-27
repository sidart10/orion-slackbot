# Story 2.4: OrionError & Graceful Degradation

Status: complete

## Story

As a **user**,
I want helpful error messages when something goes wrong,
So that I understand what happened and what to do next.

## Acceptance Criteria

1. **Given** an error occurs during processing, **When** the error is caught, **Then** it is wrapped in the OrionError interface (code, message, userMessage, recoverable)

2. **Given** an error is wrapped, **When** the response is sent, **Then** a user-friendly message is returned to Slack

3. **Given** an error occurs, **When** it is logged, **Then** the full error details are logged with structured JSON (AR12)

4. **Given** a recoverable error occurs, **When** recovery is attempted, **Then** recoverable errors trigger retries with exponential backoff

5. **Given** a request is in progress, **When** it takes too long, **Then** the 4-minute hard timeout is enforced (AR20)

## Tasks / Subtasks

- [x] **Task 1: Create OrionError Types** (AC: #1)
  - [x] Create `src/utils/errors.ts`
  - [x] Define `OrionError` interface
  - [x] Define `ErrorCode` enum with all error types
  - [x] Create error factory functions
  - [x] Implement `isRecoverable()` helper

- [x] **Task 2: Create User-Friendly Messages** (AC: #2)
  - [x] Create `getUserMessage()` function
  - [x] Map error codes to friendly messages
  - [x] Format messages for Slack mrkdwn
  - [x] Include suggestions for resolution
  - [x] Update `src/agent/verification.ts` `createGracefulFailureResponse()` to use `getUserMessage(VERIFICATION_FAILED)` (H1 fix)

- [x] **Task 3: Implement Structured Error Logging** (AC: #3)
  - [x] Update `src/utils/logger.ts` for error logging
  - [x] Include all OrionError fields
  - [x] Add stack traces for debugging
  - [x] Include trace IDs for correlation

- [x] **Task 4: Implement Retry with Exponential Backoff** (AC: #4)
  - [x] Create `retryWithBackoff()` utility
  - [x] Configure retry for recoverable errors
  - [x] Set maximum retry attempts (3)
  - [x] Log retry attempts

- [x] **Task 5: Implement 4-Minute Timeout** (AC: #5)
  - [x] Create `withTimeout()` wrapper with timer cleanup (H3 fix)
  - [x] Set 4-minute (240s) hard limit
  - [x] Return timeout error on expiry
  - [x] Log timeout events
  - [x] Wrap in user-message.ts AFTER `streamer.start()` (M1 placement)
  - [x] Note: M3 abort strategy — timeout rejects promise but in-flight operations continue; acceptable for now as Anthropic SDK handles its own cleanup

- [x] **Task 6: Verification** (AC: all)
  - [x] Trigger various error conditions
  - [x] Verify user-friendly messages in Slack
  - [x] Check logs for structured error details
  - [x] Test retry behavior
  - [x] Verify timeout enforcement
  - [x] Add unit tests:
    - [x] `src/utils/errors.ts`: each `ErrorCode` produces a userMessage that follows the required template (starts with `⚠️`, contains `*What I can do instead:*`, includes at least 2 `💡` alternatives)
    - [x] `retryWithBackoff()`: retries up to max attempts and uses exponential delay (mock timers)
    - [x] `withTimeout()`: rejects at ~240s with `AGENT_TIMEOUT` OrionError (mock timers)
  - [x] Add an integration-ish test:
    - [x] Simulate a timeout in the message handling path and confirm Slack receives the friendly error message (no raw stack/technical details)

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR12 | architecture.md | Structured JSON logging for all log statements |
| AR20 | architecture.md | 4-minute hard timeout |
| FR50 | prd.md | Contextual error messages with suggested next steps |
| UX Spec | ux-design-specification.md | Error with Alternative pattern |

### Epic Requirements Summary (from `_bmad-output/epics.md`)

- **Why this exists (FR50)**: Errors must be contextual, explain what failed, and offer suggested next steps (not “something went wrong”).
- **Scope boundary**: Implement the error surface area + retry/timeout behaviors needed for graceful degradation; do not introduce new product features.
- **Dependencies**: Builds on Story 2.1–2.3 agent loop + verification/retry patterns (reuse existing retry attempt caps and helper patterns).

### Validated Against (Versions & Global Rules)

- **Project rules + exact versions**: `_bmad-output/project-context.md` (especially “Technology Stack (EXACT VERSIONS)” and “Slack mrkdwn Reference”)
- **Slack AI app UX patterns (FR47–50)**: `_bmad-output/architecture.md#Slack AI App Patterns (FR47-50)`
- **Error template source of truth**: `_bmad-output/ux-design-specification.md#Pattern 3: Error with Alternative`

### UX Spec Error Pattern (MANDATORY)

All user-facing errors MUST follow this template:

```
⚠️ Couldn't [Action]

[Clear explanation of why]

*What I Can Do Instead:*
• 💡 Alternative option 1
• 💡 Alternative option 2

Want to try one of these?
```

**Key Principles:**
1. Never generic "something went wrong"
2. Always explain what failed and why
3. Always offer alternatives or next steps
4. Use ⚠️ emoji prefix for errors
5. Use 💡 emoji for alternatives

### src/utils/errors.ts

```typescript
export const ErrorCode = {
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',  // H2: Align with ToolErrorCode
  CONTEXT_LIMIT: 'CONTEXT_LIMIT',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  MCP_CONNECTION_ERROR: 'MCP_CONNECTION_ERROR',
  SLACK_API_ERROR: 'SLACK_API_ERROR',
  LLM_API_ERROR: 'LLM_API_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export interface OrionError {
  code: ErrorCodeType;
  message: string;           // Technical message
  userMessage: string;       // User-friendly message
  recoverable: boolean;
  retryCount?: number;
  cause?: Error;
  metadata?: Record<string, unknown>;
}

export function createOrionError(
  code: ErrorCodeType,
  message: string,
  options?: Partial<OrionError>
): OrionError {
  return {
    code,
    message,
    userMessage: getUserMessage(code),
    recoverable: isRecoverable(code),
    ...options,
  };
}

/**
 * Generate UX-spec-compliant error message
 * Pattern: ⚠️ Couldn't [Action] + Explanation + Alternatives
 */
function getUserMessage(code: ErrorCodeType): string {
  const templates: Record<ErrorCodeType, string> = {
    AGENT_TIMEOUT: `⚠️ *Couldn't complete your request in time*

This task is taking longer than expected.

*What I can do instead:*
• 💡 Try a simpler version of your request
• 💡 Start a new thread and try again
• 💡 Break your request into smaller parts`,

    TOOL_TIMEOUT: `⚠️ *Couldn't reach an external service*

One of the tools I was using is taking too long to respond.

*What I can do instead:*
• 💡 Try the request again (services may recover)
• 💡 Ask me to try a different approach
• 💡 Let me know if you need a manual workaround`,

    CONTEXT_LIMIT: `⚠️ *This conversation has gotten quite long*

I'm having trouble keeping track of all the context.

*What I can do instead:*
• 💡 Start a new thread and I'll summarize what we discussed
• 💡 Continue with a focused question
• 💡 Tell me the key context I should remember`,

    VERIFICATION_FAILED: `⚠️ *Couldn't verify my response*

I tried multiple times but wasn't confident in my answer.

*What I can do instead:*
• 💡 Try rephrasing your question
• 💡 Provide more specific context
• 💡 Ask me to search for specific sources`,

    MCP_CONNECTION_ERROR: `⚠️ *Couldn't connect to an external service*

I'm having trouble reaching one of the tools I need.

*What I can do instead:*
• 💡 Try again in a moment
• 💡 Ask me to use a different approach
• 💡 Let me know if there's a specific system you need`,

    SLACK_API_ERROR: `⚠️ *Slack is having some trouble*

I'm having difficulty communicating with Slack's systems.

*What you can try:*
• 💡 Wait a moment and try again
• 💡 Refresh your Slack client`,

    LLM_API_ERROR: `⚠️ *Having trouble processing your request*

My AI processing is experiencing issues.

*What I can do instead:*
• 💡 Try again in a moment
• 💡 Simplify your request`,

    TOOL_EXECUTION_FAILED: `⚠️ *Couldn't complete a tool operation*

One of my tools encountered an error while executing.

*What I can do instead:*
• 💡 Try the request again
• 💡 Ask me to try a different approach
• 💡 Let me know what specific outcome you need`,

    INVALID_INPUT: `⚠️ *I need a bit more context*

I'm not sure I understood your request.

*What I can do instead:*
• 💡 Rephrase your question with more details
• 💡 Tell me what you're trying to accomplish
• 💡 Break down your request into specific steps`,

    UNKNOWN_ERROR: `⚠️ *Something unexpected happened*

I encountered an issue I wasn't expecting.

*What you can try:*
• 💡 Start a new thread and try again
• 💡 Rephrase your request
• 💡 Contact the team if this keeps happening`,
  };
  return templates[code];
}

function isRecoverable(code: ErrorCodeType): boolean {
  const recoverableCodes: ErrorCodeType[] = [
    'TOOL_TIMEOUT',
    'TOOL_EXECUTION_FAILED',  // H2: May succeed on retry
    'MCP_CONNECTION_ERROR',
    'SLACK_API_ERROR',
    'LLM_API_ERROR',
  ];
  return recoverableCodes.includes(code);
}
```

### Retry with Exponential Backoff

```typescript
/**
 * Retry a function with exponential backoff.
 * CRITICAL: Wraps final error in OrionError (H4 fix).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { 
    maxRetries: number; 
    baseDelay: number;
    /** Error code to use if all retries fail */
    errorCode?: ErrorCodeType;
  }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Log retry attempt
      logger.info({
        event: 'retry.attempt',
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        error: lastError.message,
      });
      
      if (attempt < options.maxRetries - 1) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  // H4: Wrap in OrionError, never throw raw Error
  throw createOrionError(
    options.errorCode ?? inferErrorCode(lastError),
    lastError?.message ?? 'Operation failed after retries',
    { cause: lastError, retryCount: options.maxRetries }
  );
}

/**
 * Infer appropriate ErrorCode from error characteristics.
 */
function inferErrorCode(error: Error | undefined): ErrorCodeType {
  if (!error) return 'UNKNOWN_ERROR';
  const msg = error.message.toLowerCase();
  
  if (msg.includes('timeout')) return 'TOOL_TIMEOUT';
  if (msg.includes('rate limit') || msg.includes('429')) return 'LLM_API_ERROR';
  if (msg.includes('connection') || msg.includes('econnrefused')) return 'MCP_CONNECTION_ERROR';
  if (msg.includes('slack')) return 'SLACK_API_ERROR';
  
  return 'UNKNOWN_ERROR';
}
```

### Timeout Wrapper

```typescript
const HARD_TIMEOUT_MS = 240_000; // 4 minutes (AR20)

/**
 * Wrap a promise with a hard timeout.
 * CRITICAL: Clears timer on success to prevent memory leak (H3 fix).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = HARD_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createOrionError('AGENT_TIMEOUT', `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    // H3: Always clear timer to prevent memory leak
    clearTimeout(timeoutId!);
  }
}
```

### File Structure After This Story

```
orion-slack-agent/
├── src/
│   ├── agent/
│   │   ├── orion.ts                # Updated with error wrapping
│   │   ├── loop.ts                 # Updated with timeout + error handling
│   │   ├── loader.ts               # From Story 2.1
│   │   └── tools.ts                # From Story 2.1
│   ├── utils/
│   │   ├── errors.ts               # NEW: OrionError, ErrorCode, retryWithBackoff, withTimeout
│   │   ├── logger.ts               # Updated for structured error logging
│   │   ├── formatting.ts           # From Story 1.5
│   │   └── streaming.ts            # From Story 1.5
│   ├── slack/
│   │   └── handlers/
│   │       └── user-message.ts     # Wrapped in withTimeout
│   └── ...
└── ...
```

### References

- [Source: _bmad-output/epics.md#Story 2.4] — Original story
- [Source: _bmad-output/architecture.md#Error Handling] — Error patterns

### Previous Story Intelligence

From Story 2-3 (Verification & Retry):
- `verifyResponse()` function with VERIFICATION_RULES
- MAX_ATTEMPTS = 3 constant for retry logic
- `createGracefulFailureResponse()` exists — **REPLACE** with OrionError-based version (H1)
  - Current function returns apology-style message
  - New version must follow UX-spec template (⚠️ + alternatives)
  - Update `src/agent/verification.ts` to use `getUserMessage(ErrorCode.VERIFICATION_FAILED)`

From Story 2-2 (Agent Loop):
- `executeAgentLoop()` orchestrates gather/act/verify phases
- Loop catches errors but needs structured wrapping

From Story 2-1 (Anthropic API):
- `runOrionAgent()` async generator for streaming
- Agent throws on API errors—needs timeout protection

From Story 1-2 (Langfuse):
- `createSpan()` for nested error logging
- Trace IDs available for correlation

### ToolError vs OrionError (H2 Integration)

`src/utils/tool-result.ts` defines `ToolError` for tool handlers. OrionError is the user-facing wrapper.

**Integration pattern:**
```typescript
// In error handling path, convert ToolError → OrionError
if (!toolResult.success) {
  throw createOrionError(
    toolResult.error.code === 'TOOL_EXECUTION_FAILED' 
      ? 'TOOL_EXECUTION_FAILED' 
      : 'TOOL_TIMEOUT',
    toolResult.error.message,
    { metadata: { originalCode: toolResult.error.code } }
  );
}
```

### Timeout Placement (M1 Clarification)

In `src/slack/handlers/user-message.ts`, wrap the `startActiveObservation` callback body, but **AFTER** `streamer.start()`:

```typescript
// Line ~107 in user-message.ts
await startActiveObservation({ ... }, async (trace: TraceWrapper) => {
  // ... setup code ...
  
  await streamer.start();  // ← BEFORE timeout (NFR4: 500ms first token)
  
  // Wrap the agent call + processing in timeout
  await withTimeout(async () => {
    const threadHistory = await fetchThreadHistory(...);
    // ... agent call and streaming ...
  }, HARD_TIMEOUT_MS);
});
```

This ensures:
1. NFR4 met: `streamer.start()` happens before timeout
2. AR20 met: Agent processing has 4-min hard limit
3. Graceful: Timeout triggers OrionError with user-friendly message

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- 4-minute timeout is below Cloud Run default (5 min) to allow graceful handling
- Exponential backoff prevents thundering herd on transient failures
- User messages should never expose technical details

### Code Review Fixes Applied (2025-12-23)

| ID | Severity | Issue | Fix Applied |
|----|----------|-------|-------------|
| H1 | HIGH | createGracefulFailureResponse pattern conflict | Added subtask to update verification.ts to use getUserMessage() |
| H2 | HIGH | ToolError vs OrionError duplication | Added TOOL_EXECUTION_FAILED to ErrorCode + integration pattern |
| H3 | HIGH | withTimeout memory leak | Updated spec to clear timer in finally block |
| H4 | HIGH | retryWithBackoff throws raw Error | Updated spec to wrap in createOrionError with inferErrorCode |
| M1 | MEDIUM | Timeout placement unspecified | Added "Timeout Placement" section with exact location |
| M2 | MEDIUM | Missing TOOL_EXECUTION_FAILED | Added to ErrorCode enum with user message |
| M3 | MEDIUM | Timeout + abort strategy | Documented in Task 5 subtasks |
| M4 | MEDIUM | INVALID_INPUT uses 🤔 not ⚠️ | Fixed to use ⚠️ for consistency |
| L1 | LOW | Missing test file in File List | Added errors.test.ts to File List |
| L2 | LOW | Verification codes vs OrionError codes | Documented: VERIFICATION_FAILED wraps detailed issues in metadata |

### Verification Codes Relationship (L2)

`src/agent/verification.ts` uses granular codes like `EMPTY_RESPONSE`, `MARKDOWN_BOLD`.
OrionError uses `VERIFICATION_FAILED` as the user-facing code.

**Pattern:** Store granular codes in `metadata.verificationIssues`:
```typescript
createOrionError('VERIFICATION_FAILED', 'Response failed verification', {
  metadata: { 
    verificationIssues: issues.map(i => i.code),
    attemptCount: attempts 
  }
});
```

### File List

Files to create:
- `src/utils/errors.ts`
- `src/utils/errors.test.ts` (L1 fix: was missing)

Files to modify:
- `src/utils/logger.ts`
- `src/agent/loop.ts` (add error handling)
- `src/agent/verification.ts` (H1: update createGracefulFailureResponse to use OrionError)
- `src/slack/handlers/user-message.ts` (wrap in timeout per M1 placement)

