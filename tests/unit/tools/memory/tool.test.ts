/**
 * Memory Tool Registration Tests (SDK Helper)
 *
 * Tests for getMemoryTool using betaMemoryTool helper.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#10 - betaMemoryTool integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock SDK helper
vi.mock('@anthropic-ai/sdk/helpers/beta/memory', () => ({
  betaMemoryTool: vi.fn().mockReturnValue({
    type: 'memory_20250818',
    name: 'memory',
  }),
}));

// Mock handlers
vi.mock('@/tools/memory/handlers.js', () => ({
  createMemoryHandlers: vi.fn().mockReturnValue({
    view: vi.fn(),
    create: vi.fn(),
    str_replace: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
  }),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { betaMemoryTool } from '@anthropic-ai/sdk/helpers/beta/memory';
import { createMemoryHandlers } from '@/tools/memory/handlers.js';
import {
  getMemoryTool,
  setMemoryToolContext,
  clearMemoryToolContext,
  MEMORY_TOOL_NAME,
} from '@/tools/memory/tool.js';

describe('Memory Tool (SDK Helper)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearMemoryToolContext();
  });

  describe('getMemoryTool', () => {
    it('throws if context not set', () => {
      expect(() => getMemoryTool()).toThrow('Memory tool context not set');
    });

    it('returns betaMemoryTool with handlers', () => {
      setMemoryToolContext('test-bucket', 'trace-123');

      const tool = getMemoryTool();

      expect(tool).toEqual({ type: 'memory_20250818', name: 'memory' });
      expect(createMemoryHandlers).toHaveBeenCalledWith('test-bucket', 'trace-123');
      expect(betaMemoryTool).toHaveBeenCalled();
    });

    it('returns tool with type memory_20250818', () => {
      setMemoryToolContext('test-bucket', 'trace-123');

      const tool = getMemoryTool();

      expect(tool.type).toBe('memory_20250818');
    });
  });

  describe('context management', () => {
    it('setMemoryToolContext sets bucket and traceId', () => {
      setMemoryToolContext('my-bucket', 'my-trace');

      getMemoryTool();

      expect(createMemoryHandlers).toHaveBeenCalledWith('my-bucket', 'my-trace');
    });

    it('clearMemoryToolContext clears context', () => {
      setMemoryToolContext('my-bucket', 'my-trace');
      clearMemoryToolContext();

      expect(() => getMemoryTool()).toThrow('context not set');
    });
  });

  describe('MEMORY_TOOL_NAME', () => {
    it('exports correct tool name', () => {
      expect(MEMORY_TOOL_NAME).toBe('memory');
    });
  });
});
