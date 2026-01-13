/**
 * Error Humanizer Module for User-Friendly Error Messages.
 *
 * Converts technical error messages into user-friendly text while
 * preserving technical details for logging.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#4 - User-Friendly Error Messages
 */

/**
 * Result of humanizing an error.
 *
 * Contains both the user-friendly message and technical details for logging.
 */
export interface HumanizedError {
  /** User-friendly message to display */
  userMessage: string;
  /** Full technical details for logging/debugging */
  technicalDetails: string;
  /** Extracted error type (e.g., 'ModuleNotFoundError', 'TimeoutError') */
  errorType: string;
}

/**
 * Mapping of Python/JS error types to user-friendly messages.
 *
 * @see Story 8.5 AC#4 - Error type to message mapping
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Python errors
  ModuleNotFoundError:
    "The requested operation requires a capability that isn't available. Try a different approach.",
  ImportError:
    "The requested operation requires a capability that isn't available. Try a different approach.",
  TimeoutError: 'This operation took too long. Try simplifying your request.',
  'asyncio.TimeoutError':
    'This operation took too long. Try simplifying your request.',
  PermissionError:
    "I don't have access to that resource. Please check permissions.",
  ConnectionError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  HTTPError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  requests_HTTPError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  ConnectionRefusedError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  ConnectionResetError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  URLError:
    "Couldn't connect to the external service. It may be temporarily unavailable.",

  // JavaScript/Node errors
  ECONNREFUSED:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  ETIMEDOUT: 'This operation took too long. Try simplifying your request.',
  ENOTFOUND:
    "Couldn't connect to the external service. It may be temporarily unavailable.",
  EPERM: "I don't have access to that resource. Please check permissions.",
  EACCES: "I don't have access to that resource. Please check permissions.",

  // Common Python runtime errors
  ValueError: "There was an issue with the data format. I'll try a different approach.",
  TypeError: "There was a technical issue. I'll try a different approach.",
  KeyError: "The expected data wasn't found. I'll try a different approach.",
  IndexError: "The expected data wasn't found. I'll try a different approach.",
  AttributeError: "There was a technical issue. I'll try a different approach.",
  RuntimeError: "Something went wrong. I'll try a different approach.",
  MemoryError:
    'This operation requires too many resources. Try simplifying your request.',
  RecursionError:
    'This operation is too complex. Try breaking it into smaller steps.',

  // File/IO errors
  FileNotFoundError:
    "The requested file couldn't be found. Please check the file exists.",
  IsADirectoryError: 'Expected a file but found a directory.',
  NotADirectoryError: 'Expected a directory but found a file.',
  IOError: 'There was an issue accessing the file or resource.',

  // JSON errors
  JSONDecodeError:
    'There was an issue reading the data. The format may be incorrect.',
  'json.JSONDecodeError':
    'There was an issue reading the data. The format may be incorrect.',
};

/** Default message for unknown error types */
const DEFAULT_ERROR_MESSAGE = "Something went wrong. I'll try a different approach.";

/**
 * Extract the error type from a Python stack trace.
 *
 * Parses the final line of a Python traceback to extract the error type.
 *
 * @param text - Text that may contain a Python stack trace
 * @returns Extracted error type or null if not found
 *
 * @example
 * extractPythonErrorType('Traceback...\\nValueError: Invalid data')
 * // => 'ValueError'
 */
export function extractPythonErrorType(text: string): string | null {
  // Look for Python error type at start of line
  // Pattern: ErrorType: message or ErrorType(message)
  const lines = text.split('\n');

  // Check from the end for the error line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? '').trim();

    // Skip empty lines
    if (!line) continue;

    // Skip stack trace lines
    if (line.startsWith('File "') || line.startsWith('at ')) continue;

    // Match pattern: ErrorType: message
    const colonMatch = line.match(/^([A-Za-z_][A-Za-z0-9_.]*Error|[A-Za-z_][A-Za-z0-9_.]*Exception):\s*/);
    if (colonMatch) {
      return colonMatch[1] ?? null;
    }

    // Match pattern: module.ErrorType: message (e.g., json.JSONDecodeError)
    const moduleMatch = line.match(/^([a-z_][a-z0-9_]*\.[A-Za-z_][A-Za-z0-9_.]*Error):\s*/);
    if (moduleMatch) {
      return moduleMatch[1] ?? null;
    }

    // Match bare error name (asyncio.TimeoutError sometimes appears without colon)
    const bareMatch = line.match(/^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception))$/);
    if (bareMatch) {
      return bareMatch[1] ?? null;
    }
  }

  return null;
}

/**
 * Extract error type from a JavaScript Error object or message.
 *
 * @param error - Error object or string
 * @returns Extracted error type or 'Error'
 */
function extractJSErrorType(error: Error | string): string {
  if (typeof error === 'string') {
    // Check for known error code patterns
    const codeMatch = error.match(/\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPERM|EACCES)\b/);
    if (codeMatch) {
      return codeMatch[1] ?? 'Error';
    }

    // Check for error type prefix
    const typeMatch = error.match(/^([A-Za-z]+Error):/);
    if (typeMatch) {
      return typeMatch[1] ?? 'Error';
    }

    return 'Error';
  }

  // Error object
  if (error.name && error.name !== 'Error') {
    return error.name;
  }

  // Check message for error codes
  if (error.message) {
    const codeMatch = error.message.match(
      /\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPERM|EACCES)\b/
    );
    if (codeMatch) {
      return codeMatch[1] ?? 'Error';
    }
  }

  // Check for code property
  const errorWithCode = error as Error & { code?: string };
  if (errorWithCode.code) {
    return errorWithCode.code;
  }

  return 'Error';
}

/**
 * Convert a technical error into a user-friendly message.
 *
 * This function:
 * 1. Extracts the error type from Python stack traces or JS errors
 * 2. Maps to a user-friendly message from the known error mappings
 * 3. Falls back to a generic message for unknown errors
 * 4. Preserves technical details for logging
 *
 * @param error - Error string, Error object, or unknown value
 * @returns HumanizedError with user message and technical details
 *
 * @see Story 8.5 AC#4 - User-friendly error messages
 *
 * @example
 * humanizeError("ModuleNotFoundError: No module named 'pandas'")
 * // => {
 * //   userMessage: "The requested operation requires a capability that isn't available...",
 * //   technicalDetails: "ModuleNotFoundError: No module named 'pandas'",
 * //   errorType: 'ModuleNotFoundError'
 * // }
 *
 * humanizeError(new Error('ECONNREFUSED'))
 * // => {
 * //   userMessage: "Couldn't connect to the external service...",
 * //   technicalDetails: 'ECONNREFUSED',
 * //   errorType: 'ECONNREFUSED'
 * // }
 */
export function humanizeError(error: string | Error | unknown): HumanizedError {
  // Handle null/undefined
  if (error == null) {
    return {
      userMessage: DEFAULT_ERROR_MESSAGE,
      technicalDetails: 'null or undefined error',
      errorType: 'Unknown',
    };
  }

  // Convert to string for analysis
  let errorString: string;
  let errorType: string;

  if (error instanceof Error) {
    errorString = error.stack ?? error.message ?? String(error);
    errorType = extractJSErrorType(error);
  } else if (typeof error === 'string') {
    errorString = error;
    // Try to extract Python error type first
    errorType = extractPythonErrorType(error) ?? extractJSErrorType(error);
  } else {
    // Unknown error type
    errorString = String(error);
    errorType = 'Unknown';
  }

  // Handle empty error string
  if (!errorString.trim()) {
    return {
      userMessage: DEFAULT_ERROR_MESSAGE,
      technicalDetails: 'Empty error message',
      errorType: 'Unknown',
    };
  }

  // Try to extract Python error type if not already found
  if (errorType === 'Error' || errorType === 'Unknown') {
    const pythonType = extractPythonErrorType(errorString);
    if (pythonType) {
      errorType = pythonType;
    }
  }

  // Look up user-friendly message
  let userMessage = ERROR_MESSAGES[errorType];

  // If not found, check for partial matches (e.g., 'requests.HTTPError' -> 'HTTPError')
  if (!userMessage) {
    const baseName = errorType.split('.').pop();
    if (baseName) {
      userMessage = ERROR_MESSAGES[baseName];
    }
  }

  // Fall back to default message
  if (!userMessage) {
    userMessage = DEFAULT_ERROR_MESSAGE;
  }

  return {
    userMessage,
    technicalDetails: errorString,
    errorType,
  };
}

/**
 * Check if an error is likely retryable based on its type.
 *
 * @param errorType - The error type string
 * @returns True if the error is likely transient and retryable
 */
export function isRetryableError(errorType: string): boolean {
  const retryableTypes = new Set([
    'TimeoutError',
    'asyncio.TimeoutError',
    'ConnectionError',
    'ConnectionRefusedError',
    'ConnectionResetError',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'HTTPError',
    'URLError',
  ]);

  return retryableTypes.has(errorType);
}
