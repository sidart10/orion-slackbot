/**
 * OrionError Types & Error Handling
 *
 * Provides structured error handling for the Orion agent:
 * - OrionError interface with code, message, userMessage, recoverable
 * - ErrorCode enum for all error types
 * - Factory functions for error creation
 * - User-friendly message mapping
 * - Recoverability detection
 *
 * @see Story 2.4 - OrionError & Graceful Degradation
 * @see AC#1 - Errors wrapped in OrionError interface
 * @see AC#2 - User-friendly messages returned to Slack
 * @see AR12 - Structured JSON logging for errors
 */

/**
 * All possible error codes in the Orion system
 */
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
  // Slack-specific error codes (Story 1.9)
  SLACK_ACK_TIMEOUT: 'SLACK_ACK_TIMEOUT',
  SLACK_UPDATE_FAILED: 'SLACK_UPDATE_FAILED',
  SLACK_HANDLER_FAILED: 'SLACK_HANDLER_FAILED',
  SLACK_SIGNATURE_INVALID: 'SLACK_SIGNATURE_INVALID',
  // Sandbox error codes (Story 3.0)
  SANDBOX_CREATION_FAILED: 'SANDBOX_CREATION_FAILED',
  SANDBOX_TIMEOUT: 'SANDBOX_TIMEOUT',
  SANDBOX_SETUP_FAILED: 'SANDBOX_SETUP_FAILED',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
} as const;

/**
 * Type for error code values
 */
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error interface for Orion
 *
 * All errors in the system should be wrapped in this interface
 * to provide consistent error handling and user-friendly messages.
 */
export interface OrionError {
  /** Error code for categorization and handling */
  code: ErrorCodeType;
  /** Technical message for logging and debugging */
  message: string;
  /** User-friendly message safe to show in Slack */
  userMessage: string;
  /** Whether this error can be recovered from with retry */
  recoverable: boolean;
  /** Number of retry attempts made (if applicable) */
  retryCount?: number;
  /** Original error that caused this error */
  cause?: Error;
  /** Additional context for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * User-friendly messages for each error code with resolution suggestions
 *
 * These messages are designed to:
 * - Never expose technical details
 * - Be helpful and actionable with resolution guidance
 * - Be appropriate for Slack display
 *
 * @see Story 2.4 Task 2 - Include suggestions for resolution
 */
const USER_MESSAGES: Record<ErrorCodeType, string> = {
  AGENT_TIMEOUT:
    "I'm taking longer than expected. Please try again in a moment, or try a simpler question.",
  TOOL_TIMEOUT:
    "One of my tools is taking too long. I'll try a different approach. If this persists, try again shortly.",
  CONTEXT_LIMIT:
    "This conversation has gotten quite long. Start a new thread to continue with fresh context.",
  VERIFICATION_FAILED:
    "I couldn't verify my response. Let me try again. If this persists, try rephrasing your question.",
  MCP_CONNECTION_ERROR:
    "I'm having trouble connecting to an external service. Please try again in a few minutes.",
  SLACK_API_ERROR:
    "I'm having trouble communicating with Slack. This is usually temporary — please try again.",
  LLM_API_ERROR:
    "I'm having trouble processing your request. Please try again, or simplify your question.",
  INVALID_INPUT:
    "I didn't understand that. Could you rephrase your question with more detail?",
  UNKNOWN_ERROR:
    'Something unexpected happened. Please try again. If this persists, start a new thread.',
  // Slack-specific error messages (Story 1.9)
  SLACK_ACK_TIMEOUT:
    "I couldn't acknowledge your message in time. Please try again.",
  SLACK_UPDATE_FAILED:
    "I had trouble updating my response. The original message may still be valid.",
  SLACK_HANDLER_FAILED:
    'Something went wrong processing your request. Please try again.',
  SLACK_SIGNATURE_INVALID:
    'Request verification failed. If this persists, contact an admin.',
  // Sandbox error messages (Story 3.0)
  SANDBOX_CREATION_FAILED:
    "I'm having trouble starting up. Please try again in a moment.",
  SANDBOX_TIMEOUT:
    'Your request took too long. Please try a simpler question.',
  SANDBOX_SETUP_FAILED: 'Agent setup failed. Please try again.',
  AGENT_EXECUTION_FAILED: 'I had trouble processing your request. Please try again.',
};

/**
 * Error codes that are considered recoverable
 *
 * These errors may succeed on retry (transient failures).
 * Non-recoverable errors should not be retried.
 */
const RECOVERABLE_CODES: ErrorCodeType[] = [
  'TOOL_TIMEOUT',
  'MCP_CONNECTION_ERROR',
  'SLACK_API_ERROR',
  'LLM_API_ERROR',
  'SANDBOX_CREATION_FAILED',
  'SANDBOX_SETUP_FAILED',
  'AGENT_EXECUTION_FAILED',
];

/**
 * Get user-friendly message for an error code
 *
 * @param code - The error code
 * @returns User-friendly message safe for Slack display
 */
export function getUserMessage(code: ErrorCodeType): string {
  return USER_MESSAGES[code];
}

/**
 * Check if an error code is recoverable
 *
 * Recoverable errors may succeed on retry (transient failures).
 *
 * @param code - The error code to check
 * @returns true if the error is recoverable
 */
export function isRecoverable(code: ErrorCodeType): boolean {
  return RECOVERABLE_CODES.includes(code);
}

/**
 * Create a structured OrionError
 *
 * Factory function that creates an OrionError with:
 * - Auto-populated userMessage based on error code
 * - Auto-populated recoverable flag based on error code
 * - Support for optional overrides and additional fields
 *
 * @param code - Error code from ErrorCode enum
 * @param message - Technical message for logging
 * @param options - Optional overrides and additional fields
 * @returns Structured OrionError
 */
export function createOrionError(
  code: ErrorCodeType,
  message: string,
  options?: Partial<Omit<OrionError, 'code' | 'message'>>
): OrionError {
  return {
    code,
    message,
    userMessage: options?.userMessage ?? getUserMessage(code),
    recoverable: options?.recoverable ?? isRecoverable(code),
    ...options,
  };
}

/**
 * Type guard to check if an unknown value is an OrionError
 *
 * @param error - Unknown value to check
 * @returns true if the value is an OrionError
 */
export function isOrionError(error: unknown): error is OrionError {
  if (error === null || error === undefined || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Record<string, unknown>;

  // Check required fields exist
  if (
    typeof candidate.code !== 'string' ||
    typeof candidate.message !== 'string' ||
    typeof candidate.userMessage !== 'string' ||
    typeof candidate.recoverable !== 'boolean'
  ) {
    return false;
  }

  // Check code is a valid ErrorCode
  const validCodes = Object.values(ErrorCode) as string[];
  return validCodes.includes(candidate.code);
}

/**
 * Hard timeout for agent operations (4 minutes per AR20)
 *
 * This is set below Cloud Run's default timeout (5 minutes)
 * to allow graceful error handling before the infrastructure times out.
 */
export const HARD_TIMEOUT_MS = 240_000; // 4 minutes

/**
 * Wrap a promise with a timeout
 *
 * Returns AGENT_TIMEOUT error if promise doesn't resolve within the timeout.
 * Allows graceful handling before infrastructure timeouts occur.
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: HARD_TIMEOUT_MS)
 * @returns Result of the promise
 * @throws OrionError with AGENT_TIMEOUT code if timeout exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = HARD_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createOrionError(ErrorCode.AGENT_TIMEOUT, `Operation timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Options for retryWithBackoff
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds (doubles each retry) */
  baseDelayMs: number;
  /** Optional callback called before each retry */
  onRetry?: (attempt: number, error: Error) => void;
  /** Optional predicate to determine if retry should happen */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retry a function with exponential backoff
 *
 * Implements retry logic for recoverable errors:
 * - Exponential backoff: delay doubles each attempt
 * - Maximum retry attempts enforced
 * - Optional callbacks for logging retries
 * - Optional predicate to skip retries for non-recoverable errors
 *
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of successful function call
 * @throws Last error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (options.shouldRetry && !options.shouldRetry(error)) {
        throw error;
      }

      // Last attempt - don't delay, just throw
      if (attempt >= options.maxRetries - 1) {
        break;
      }

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt + 1, error as Error);
      }

      // Exponential backoff delay
      const delay = options.baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Log an OrionError with full structured details
 *
 * Includes all OrionError fields plus:
 * - Stack trace for debugging (when cause is present)
 * - Trace ID for correlation
 * - Structured JSON format per AR12
 *
 * @param error - OrionError to log
 * @param traceId - Optional trace ID for correlation
 */
export function logOrionError(error: OrionError, traceId?: string): void {
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: 'error',
    event: 'orion_error',
    errorCode: error.code,
    message: error.message,
    userMessage: error.userMessage,
    recoverable: error.recoverable,
  };

  if (traceId) {
    logEntry.traceId = traceId;
  }

  if (error.retryCount !== undefined) {
    logEntry.retryCount = error.retryCount;
  }

  if (error.metadata) {
    logEntry.metadata = error.metadata;
  }

  if (error.cause) {
    logEntry.stack = error.cause.stack ?? error.cause.message;
  }

  console.error(JSON.stringify(logEntry));
}

/**
 * Wrap any error in an OrionError
 *
 * Ensures all errors flowing through the system are properly structured.
 * If the error is already an OrionError, returns it unchanged.
 * Otherwise, wraps it in an UNKNOWN_ERROR.
 *
 * @param error - Any caught error
 * @param fallbackCode - Error code to use if not already an OrionError (default: UNKNOWN_ERROR)
 * @returns Properly structured OrionError
 *
 * @see Story 2.4 AC#1 - Errors wrapped in OrionError interface
 */
export function wrapError(
  error: unknown,
  fallbackCode: ErrorCodeType = ErrorCode.UNKNOWN_ERROR
): OrionError {
  // Already an OrionError - return as-is
  if (isOrionError(error)) {
    return error;
  }

  // Regular Error object
  if (error instanceof Error) {
    return createOrionError(fallbackCode, error.message, {
      cause: error,
    });
  }

  // Unknown error type (string, object, etc.)
  return createOrionError(fallbackCode, String(error));
}

