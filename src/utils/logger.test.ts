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

  describe('orionError', () => {
    it('should log OrionError with all structured fields (Story 2.4 AC#3)', () => {
      const cause = new Error('Original error');
      cause.stack = 'Error: Original error\n    at test.ts:1:1';

      const orionError = {
        code: 'TOOL_TIMEOUT' as const,
        message: 'Tool timed out after 30s',
        userMessage: 'User friendly message',
        recoverable: true,
        retryCount: 2,
        cause,
        metadata: { toolName: 'web_search' },
      };

      logger.orionError(orionError, {
        event: 'tool.execution.failed',
        traceId: 'trace-456',
        userId: 'U789',
      });

      expect(capturedOutput.length).toBe(1);
      const parsed = JSON.parse(capturedOutput[0]);

      // Standard log fields
      expect(parsed.level).toBe('error');
      expect(parsed.event).toBe('tool.execution.failed');
      expect(parsed.traceId).toBe('trace-456');
      expect(parsed.userId).toBe('U789');

      // OrionError-specific fields
      expect(parsed.errorCode).toBe('TOOL_TIMEOUT');
      expect(parsed.errorMessage).toBe('Tool timed out after 30s');
      expect(parsed.recoverable).toBe(true);
      expect(parsed.retryCount).toBe(2);
      expect(parsed.stack).toContain('Original error');
      expect(parsed.metadata).toEqual({ toolName: 'web_search' });
    });

    it('should handle OrionError without optional fields', () => {
      const orionError = {
        code: 'AGENT_TIMEOUT' as const,
        message: 'Agent timed out',
        userMessage: 'User message',
        recoverable: false,
      };

      logger.orionError(orionError, { event: 'agent.timeout' });

      const parsed = JSON.parse(capturedOutput[0]);
      expect(parsed.errorCode).toBe('AGENT_TIMEOUT');
      expect(parsed.recoverable).toBe(false);
      expect(parsed.retryCount).toBeUndefined();
      expect(parsed.stack).toBeUndefined();
    });
  });
});

