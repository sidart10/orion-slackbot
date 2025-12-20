/**
 * Tests for Structured Logger
 *
 * Verifies:
 * - AC#6: Structured JSON logging is used
 * - AR12: Structured JSON logging (timestamp, level, event, traceId)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('Structured Logger', () => {
  const originalConsole = {
    debug: console.debug,
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  let capturedOutput: string[] = [];

  beforeEach(() => {
    capturedOutput = [];
    console.debug = vi.fn((msg) => capturedOutput.push(msg));
    console.log = vi.fn((msg) => capturedOutput.push(msg));
    console.warn = vi.fn((msg) => capturedOutput.push(msg));
    console.error = vi.fn((msg) => capturedOutput.push(msg));
  });

  afterEach(() => {
    console.debug = originalConsole.debug;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  it('should output valid JSON', () => {
    logger.info({ event: 'test_event' });

    expect(capturedOutput.length).toBe(1);
    expect(() => JSON.parse(capturedOutput[0])).not.toThrow();
  });

  it('should include timestamp in ISO format', () => {
    logger.info({ event: 'test_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it('should include level field', () => {
    logger.info({ event: 'test_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.level).toBe('info');
  });

  it('should include event field', () => {
    logger.info({ event: 'test_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.event).toBe('test_event');
  });

  it('should include traceId when provided', () => {
    logger.info({ event: 'test_event', traceId: 'trace-123' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.traceId).toBe('trace-123');
  });

  it('should include userId when provided', () => {
    logger.info({ event: 'test_event', userId: 'U123' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.userId).toBe('U123');
  });

  it('should log debug level correctly', () => {
    logger.debug({ event: 'debug_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.level).toBe('debug');
  });

  it('should log warn level correctly', () => {
    logger.warn({ event: 'warn_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.level).toBe('warn');
  });

  it('should log error level correctly', () => {
    logger.error({ event: 'error_event' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.level).toBe('error');
  });

  it('should include additional custom fields', () => {
    logger.info({ event: 'test_event', channelId: 'C123', custom: 'value' });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.channelId).toBe('C123');
    expect(parsed.custom).toBe('value');
  });

  it('should include duration when provided', () => {
    logger.info({ event: 'test_event', duration: 150 });

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.duration).toBe(150);
  });
});

describe('logOrionError', () => {
  const originalConsole = {
    error: console.error,
  };

  let capturedOutput: string[] = [];

  beforeEach(async () => {
    capturedOutput = [];
    console.error = vi.fn((msg) => capturedOutput.push(msg));
  });

  afterEach(() => {
    console.error = originalConsole.error;
  });

  it('should log all OrionError fields', async () => {
    const { logOrionError, createOrionError, ErrorCode } = await import('./errors.js');
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Operation timed out');

    logOrionError(error);

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.event).toBe('orion_error');
    expect(parsed.level).toBe('error');
    expect(parsed.errorCode).toBe('AGENT_TIMEOUT');
    expect(parsed.message).toBe('Operation timed out');
    expect(parsed.userMessage).toBeDefined();
    expect(parsed.recoverable).toBe(false);
  });

  it('should include stack trace when cause is provided', async () => {
    const { logOrionError, createOrionError, ErrorCode } = await import('./errors.js');
    const originalError = new Error('Original error');
    const error = createOrionError(ErrorCode.UNKNOWN_ERROR, 'Wrapped', {
      cause: originalError,
    });

    logOrionError(error);

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.stack).toBeDefined();
    expect(parsed.stack).toContain('Original error');
  });

  it('should include traceId when provided', async () => {
    const { logOrionError, createOrionError, ErrorCode } = await import('./errors.js');
    const error = createOrionError(ErrorCode.SLACK_API_ERROR, 'API failed');

    logOrionError(error, 'trace-abc-123');

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.traceId).toBe('trace-abc-123');
  });

  it('should include metadata when present', async () => {
    const { logOrionError, createOrionError, ErrorCode } = await import('./errors.js');
    const error = createOrionError(ErrorCode.SLACK_API_ERROR, 'Rate limited', {
      metadata: { statusCode: 429, retryAfter: 30 },
    });

    logOrionError(error);

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.metadata).toEqual({ statusCode: 429, retryAfter: 30 });
  });

  it('should include retryCount when present', async () => {
    const { logOrionError, createOrionError, ErrorCode } = await import('./errors.js');
    const error = createOrionError(ErrorCode.TOOL_TIMEOUT, 'Retry exhausted', {
      retryCount: 3,
    });

    logOrionError(error);

    const parsed = JSON.parse(capturedOutput[0]);
    expect(parsed.retryCount).toBe(3);
  });
});

