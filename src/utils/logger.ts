/**
 * Structured JSON Logger
 *
 * Provides structured logging with consistent format per AR12:
 * - timestamp: ISO 8601 format
 * - level: debug | info | warn | error
 * - event: event name for filtering
 * - traceId: optional trace correlation
 *
 * @see AC#6 - Structured JSON logging
 * @see AR12 - Structured JSON logging (timestamp, level, event, traceId)
 * @see Story 2.4 - OrionError structured logging (AC#3)
 */

import type { OrionError } from './errors.js';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  traceId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * Extended log entry for OrionError logging.
 * @see Story 2.4 AC#3 - Full error details logged with structured JSON
 */
export interface OrionErrorLogEntry extends Omit<LogEntry, 'timestamp' | 'level'> {
  /** Error code from ErrorCode enum */
  errorCode: string;
  /** Technical error message */
  errorMessage: string;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Number of retry attempts (if applicable) */
  retryCount?: number;
  /** Stack trace for debugging */
  stack?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

function formatLog(
  level: LogEntry['level'],
  data: Omit<LogEntry, 'timestamp' | 'level'>
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...data,
  });
}

export const logger = {
  debug: (data: Omit<LogEntry, 'timestamp' | 'level'>): void => {
    console.debug(formatLog('debug', data));
  },
  info: (data: Omit<LogEntry, 'timestamp' | 'level'>): void => {
    console.log(formatLog('info', data));
  },
  warn: (data: Omit<LogEntry, 'timestamp' | 'level'>): void => {
    console.warn(formatLog('warn', data));
  },
  error: (data: Omit<LogEntry, 'timestamp' | 'level'>): void => {
    console.error(formatLog('error', data));
  },

  /**
   * Log an OrionError with full structured details.
   *
   * Includes all OrionError fields for debugging:
   * - errorCode, errorMessage, recoverable, retryCount
   * - Stack trace from cause if available
   * - Additional metadata
   *
   * @param orionError - The OrionError to log
   * @param context - Additional context (event name, traceId, etc.)
   *
   * @see Story 2.4 AC#3 - Full error details logged with structured JSON
   */
  orionError: (
    orionError: OrionError,
    context: Omit<LogEntry, 'timestamp' | 'level'>
  ): void => {
    const logData: OrionErrorLogEntry = {
      ...context,
      errorCode: orionError.code,
      errorMessage: orionError.message,
      recoverable: orionError.recoverable,
      retryCount: orionError.retryCount,
      stack: orionError.cause?.stack,
      metadata: orionError.metadata,
    };
    console.error(formatLog('error', logData));
  },
};

