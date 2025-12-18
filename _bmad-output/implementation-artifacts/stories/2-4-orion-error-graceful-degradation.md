# Story 2.4: OrionError & Graceful Degradation

Status: ready-for-dev

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

- [ ] **Task 1: Create OrionError Types** (AC: #1)
  - [ ] Create `src/utils/errors.ts`
  - [ ] Define `OrionError` interface
  - [ ] Define `ErrorCode` enum with all error types
  - [ ] Create error factory functions
  - [ ] Implement `isRecoverable()` helper

- [ ] **Task 2: Create User-Friendly Messages** (AC: #2)
  - [ ] Create `getUserMessage()` function
  - [ ] Map error codes to friendly messages
  - [ ] Format messages for Slack mrkdwn
  - [ ] Include suggestions for resolution

- [ ] **Task 3: Implement Structured Error Logging** (AC: #3)
  - [ ] Update `src/utils/logger.ts` for error logging
  - [ ] Include all OrionError fields
  - [ ] Add stack traces for debugging
  - [ ] Include trace IDs for correlation

- [ ] **Task 4: Implement Retry with Exponential Backoff** (AC: #4)
  - [ ] Create `retryWithBackoff()` utility
  - [ ] Configure retry for recoverable errors
  - [ ] Set maximum retry attempts (3)
  - [ ] Log retry attempts

- [ ] **Task 5: Implement 4-Minute Timeout** (AC: #5)
  - [ ] Create `withTimeout()` wrapper
  - [ ] Set 4-minute (240s) hard limit
  - [ ] Return timeout error on expiry
  - [ ] Log timeout events

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Trigger various error conditions
  - [ ] Verify user-friendly messages in Slack
  - [ ] Check logs for structured error details
  - [ ] Test retry behavior
  - [ ] Verify timeout enforcement

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR12 | architecture.md | Structured JSON logging for all log statements |
| AR20 | architecture.md | 4-minute hard timeout |

### src/utils/errors.ts

```typescript
export const ErrorCode = {
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
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

function getUserMessage(code: ErrorCodeType): string {
  const messages: Record<ErrorCodeType, string> = {
    AGENT_TIMEOUT: 'I\'m taking longer than expected. Please try again in a moment.',
    TOOL_TIMEOUT: 'One of my tools is taking too long. I\'ll try a different approach.',
    CONTEXT_LIMIT: 'This conversation has gotten quite long. Let me summarize and continue.',
    VERIFICATION_FAILED: 'I couldn\'t verify my response. Let me try again.',
    MCP_CONNECTION_ERROR: 'I\'m having trouble connecting to an external service.',
    SLACK_API_ERROR: 'I\'m having trouble communicating with Slack.',
    LLM_API_ERROR: 'I\'m having trouble processing your request.',
    INVALID_INPUT: 'I didn\'t understand that. Could you rephrase?',
    UNKNOWN_ERROR: 'Something unexpected happened. Please try again.',
  };
  return messages[code];
}

function isRecoverable(code: ErrorCodeType): boolean {
  const recoverableCodes: ErrorCodeType[] = [
    'TOOL_TIMEOUT',
    'MCP_CONNECTION_ERROR',
    'SLACK_API_ERROR',
    'LLM_API_ERROR',
  ];
  return recoverableCodes.includes(code);
}
```

### Retry with Exponential Backoff

```typescript
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < options.maxRetries - 1) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError;
}
```

### Timeout Wrapper

```typescript
const HARD_TIMEOUT_MS = 240_000; // 4 minutes (AR20)

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = HARD_TIMEOUT_MS
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(createOrionError('AGENT_TIMEOUT', `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]);
}
```

### References

- [Source: _bmad-output/epics.md#Story 2.4] — Original story
- [Source: _bmad-output/architecture.md#Error Handling] — Error patterns

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- 4-minute timeout is below Cloud Run default (5 min) to allow graceful handling
- Exponential backoff prevents thundering herd on transient failures
- User messages should never expose technical details

### File List

Files to create:
- `src/utils/errors.ts`

Files to modify:
- `src/utils/logger.ts`
- `src/agent/loop.ts` (add error handling)
- `src/slack/handlers/user-message.ts` (wrap in timeout)

