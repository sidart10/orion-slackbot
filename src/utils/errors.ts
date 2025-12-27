/**
 * OrionError types and utilities.
 *
 * Provides structured error handling with user-friendly messages.
 * All user-facing errors follow the UX-spec template.
 *
 * @see Story 2.4 - OrionError & Graceful Degradation
 * @see AC#1 - Error wrapped in OrionError interface
 * @see FR50 - Contextual error messages with suggested next steps
 */

import { logger } from './logger.js';

/**
 * Error codes for all Orion error types.
 * @see AC#1 - All errors must have a code
 */
export const ErrorCode = {
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  CONTEXT_LIMIT: 'CONTEXT_LIMIT',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  MCP_CONNECTION_ERROR: 'MCP_CONNECTION_ERROR',
  SLACK_API_ERROR: 'SLACK_API_ERROR',
  LLM_API_ERROR: 'LLM_API_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  // Sandbox-specific error codes (Story 3.0)
  SANDBOX_CREATION_FAILED: 'SANDBOX_CREATION_FAILED',
  SANDBOX_SETUP_FAILED: 'SANDBOX_SETUP_FAILED',
  SANDBOX_TIMEOUT: 'SANDBOX_TIMEOUT',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error interface for all Orion errors.
 * @see AC#1 - Error interface with code, message, userMessage, recoverable
 */
export interface OrionError {
  code: ErrorCodeType;
  /** Technical message for logging/debugging */
  message: string;
  /** User-friendly message for Slack (follows UX-spec template) */
  userMessage: string;
  /** Whether this error type can be retried */
  recoverable: boolean;
  /** Number of retry attempts made (if applicable) */
  retryCount?: number;
  /** Original error that caused this error */
  cause?: Error;
  /** Additional context for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Create an OrionError with defaults from the error code.
 *
 * @param code - Error code from ErrorCode enum
 * @param message - Technical message for logging
 * @param options - Optional overrides for default values
 * @returns Fully populated OrionError
 *
 * @see AC#1 - Factory function for creating errors
 */
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
 * Type guard to check if a value is an OrionError.
 */
export function isOrionError(value: unknown): value is OrionError {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.code === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.userMessage === 'string' &&
    typeof obj.recoverable === 'boolean'
  );
}

/**
 * Generate UX-spec-compliant error message.
 *
 * Pattern: ⚠️ Couldn't [Action] + Explanation + Alternatives
 *
 * @param code - Error code to get message for
 * @returns Slack mrkdwn formatted user message
 *
 * @see UX Spec - Error with Alternative pattern
 * @see AC#2 - User-friendly message returned to Slack
 */
export function getUserMessage(code: ErrorCodeType): string {
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

    TOOL_EXECUTION_FAILED: `⚠️ *Couldn't complete a tool operation*

One of my tools encountered an error while executing.

*What I can do instead:*
• 💡 Try the request again
• 💡 Ask me to try a different approach
• 💡 Let me know what specific outcome you need`,

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

    SANDBOX_CREATION_FAILED: `⚠️ *Couldn't start the processing environment*

I'm having trouble setting up a secure environment.

*What you can try:*
• 💡 Wait a moment and try again
• 💡 Try a simpler request`,

    SANDBOX_SETUP_FAILED: `⚠️ *Couldn't prepare the processing environment*

Something went wrong while setting up.

*What you can try:*
• 💡 Wait a moment and try again
• 💡 Try a simpler request`,

    SANDBOX_TIMEOUT: `Your request took too long. Please try a simpler question.`,

    AGENT_EXECUTION_FAILED: `⚠️ *Couldn't complete your request*

Something went wrong while processing.

*What you can try:*
• 💡 Try again in a moment
• 💡 Simplify your request`,
  };

  return templates[code];
}

/**
 * Check if an error code represents a recoverable error.
 *
 * Recoverable errors are those that may succeed on retry.
 *
 * @param code - Error code to check
 * @returns true if the error type is recoverable
 *
 * @see AC#4 - Recoverable errors trigger retries
 */
export function isRecoverable(code: ErrorCodeType): boolean {
  const recoverableCodes: ErrorCodeType[] = [
    'TOOL_TIMEOUT',
    'TOOL_EXECUTION_FAILED',
    'MCP_CONNECTION_ERROR',
    'SLACK_API_ERROR',
    'LLM_API_ERROR',
  ];
  return recoverableCodes.includes(code);
}

/**
 * Infer appropriate ErrorCode from error characteristics.
 *
 * Used when wrapping unknown errors in OrionError.
 *
 * @param error - Error to infer code from (may be undefined)
 * @returns Inferred ErrorCode based on error message patterns
 */
export function inferErrorCode(error: Error | undefined): ErrorCodeType {
  if (!error) return 'UNKNOWN_ERROR';
  const msg = error.message.toLowerCase();

  // Order matters: check timeout first (before connection, since "connection timed out" contains both)
  if (msg.includes('timeout') || msg.includes('timed out')) return 'TOOL_TIMEOUT';
  if (msg.includes('rate limit') || msg.includes('429')) return 'LLM_API_ERROR';
  if (msg.includes('connection') || msg.includes('econnrefused'))
    return 'MCP_CONNECTION_ERROR';
  if (msg.includes('slack')) return 'SLACK_API_ERROR';

  return 'UNKNOWN_ERROR';
}

// ============================================================================
// Retry with Exponential Backoff (AC#4)
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds (doubles each attempt) */
  baseDelay: number;
  /** Error code to use if all retries fail */
  errorCode?: ErrorCodeType;
  /** Trace ID for logging correlation */
  traceId?: string;
}

/**
 * Retry a function with exponential backoff.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful function call
 * @throws OrionError after all retries exhausted
 *
 * @see AC#4 - Recoverable errors trigger retries with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      logger.info({
        event: 'retry.attempt',
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        error: lastError.message,
        traceId: options.traceId,
      });

      if (attempt < options.maxRetries - 1) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // Wrap in OrionError, never throw raw Error
  throw createOrionError(
    options.errorCode ?? inferErrorCode(lastError),
    lastError?.message ?? 'Operation failed after retries',
    { cause: lastError, retryCount: options.maxRetries }
  );
}

// ============================================================================
// Timeout Wrapper (AC#5)
// ============================================================================

/** 4-minute hard timeout per AR20 */
export const HARD_TIMEOUT_MS = 240_000;

/**
 * Wrap a promise with a hard timeout.
 *
 * Clears timer on success to prevent memory leak.
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: 4 minutes)
 * @returns Result of the promise
 * @throws OrionError with AGENT_TIMEOUT code on timeout
 *
 * @see AC#5 - 4-minute hard timeout enforced
 * @see AR20 - 4-minute hard timeout requirement
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = HARD_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createOrionError(
          'AGENT_TIMEOUT',
          `Operation timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    // Always clear timer to prevent memory leak
    clearTimeout(timeoutId!);
  }
}

