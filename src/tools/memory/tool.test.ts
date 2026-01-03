/**
 * Memory Tool Registration Tests
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-7 - Tool registration and context management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../registry.js', () => ({
  toolRegistry: {
    registerStaticTool: vi.fn(),
  },
}));

vi.mock('../../config/environment.js', () => ({
  config: {
    gcsMemoriesBucket: 'test-bucket',
  },
}));

vi.mock('./handler.js', () => ({
  handleMemoryTool: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { toolRegistry } from '../registry.js';
import { handleMemoryTool } from './handler.js';
import {
  registerMemoryTool,
  handleMemoryToolWrapper,
  setMemoryToolContext,
  clearMemoryToolContext,
  MEMORY_TOOL_NAME,
} from './tool.js';

describe('Memory Tool Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearMemoryToolContext();
  });

  describe('registerMemoryTool', () => {
    it('should register memory tool with registry', () => {
      registerMemoryTool();

      expect(toolRegistry.registerStaticTool).toHaveBeenCalledWith(
        MEMORY_TOOL_NAME,
        expect.any(Function),
        expect.objectContaining({
          name: MEMORY_TOOL_NAME,
          description: expect.stringContaining('persistent memory'),
          input_schema: expect.objectContaining({
            properties: expect.objectContaining({
              command: expect.any(Object),
              path: expect.any(Object),
              content: expect.any(Object),
            }),
          }),
        })
      );
    });

    it('should export correct tool name', () => {
      expect(MEMORY_TOOL_NAME).toBe('memory');
    });
  });

  describe('handleMemoryToolWrapper', () => {
    it('should return success result as JSON', async () => {
      vi.mocked(handleMemoryTool).mockResolvedValue({
        success: true,
        data: { content: 'test content', path: '/memories/test.json' },
      });
      setMemoryToolContext('trace-123');

      const result = await handleMemoryToolWrapper({
        command: 'view',
        path: '/memories/test.json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.content).toBe('test content');
      expect(parsed.path).toBe('/memories/test.json');
    });

    it('should return error result as JSON', async () => {
      vi.mocked(handleMemoryTool).mockResolvedValue({
        success: false,
        error: {
          code: 'MEMORY_NOT_FOUND',
          message: 'File not found',
          retryable: false,
        },
      });
      setMemoryToolContext('trace-123');

      const result = await handleMemoryToolWrapper({
        command: 'view',
        path: '/memories/missing.json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.error).toBe('File not found');
      expect(parsed.code).toBe('MEMORY_NOT_FOUND');
      expect(parsed.retryable).toBe(false);
    });

    it('should pass traceId from context', async () => {
      vi.mocked(handleMemoryTool).mockResolvedValue({
        success: true,
        data: { content: '', path: '/memories/test.json' },
      });
      setMemoryToolContext('my-trace-id');

      await handleMemoryToolWrapper({
        command: 'view',
        path: '/memories/test.json',
      });

      expect(handleMemoryTool).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          traceId: 'my-trace-id',
          bucket: 'test-bucket',
        })
      );
    });
  });


  describe('context management', () => {
    it('should set and clear context', async () => {
      vi.mocked(handleMemoryTool).mockResolvedValue({
        success: true,
        data: { content: '', path: '/memories/test.json' },
      });

      setMemoryToolContext('trace-1');
      await handleMemoryToolWrapper({ command: 'view', path: '/memories/test.json' });

      expect(handleMemoryTool).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ traceId: 'trace-1' })
      );

      clearMemoryToolContext();
      await handleMemoryToolWrapper({ command: 'view', path: '/memories/test.json' });

      expect(handleMemoryTool).toHaveBeenLastCalledWith(
        expect.any(Object),
        expect.objectContaining({ traceId: 'no-trace' })
      );
    });
  });
});

