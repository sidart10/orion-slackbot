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
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  traceId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
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
};

