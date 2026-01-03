/**
 * Tests for execute_code tool.
 *
 * @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
 * @see AC#1 - Code runs in GKE Agent Sandbox
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCodeHandler, executeCodeToolDefinition, registerExecuteCodeTool } from './tool.js';
import { toolRegistry } from '../registry.js';
import * as sandboxClient from './sandbox-client.js';
import * as skillsLoader from '../../skills/loader.js';
import type { Skill } from '../../skills/types.js';

// Mock dependencies
vi.mock('./sandbox-client.js');
vi.mock('../../skills/loader.js');
vi.mock('../../observability/langfuse.js', () => ({
  getLangfuse: () => ({
    span: () => ({ end: vi.fn() }),
  }),
}));

describe('executeCodeToolDefinition', () => {
  it('has correct tool name (snake_case)', () => {
    expect(executeCodeToolDefinition.name).toBe('execute_code');
  });

  it('has required input schema properties', () => {
    const schema = executeCodeToolDefinition.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('code');
    expect(schema.properties).toHaveProperty('skill_script');
    expect(schema.properties).toHaveProperty('args');
    expect(schema.properties).toHaveProperty('timeout');
  });

  it('describes code execution purpose', () => {
    expect(executeCodeToolDefinition.description).toContain('Python');
    expect(executeCodeToolDefinition.description).toContain('sandbox');
  });
});

describe('executeCodeHandler', () => {
  const mockContext = { traceId: 'test-trace-123' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic code execution (AC#1)', () => {
    it('executes Python code in sandbox and returns result', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '4\n',
        stderr: '',
        return_code: 0,
      });

      const result = await executeCodeHandler(
        { code: 'print(2 + 2)' },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe('4\n');
        expect(result.data.stderr).toBe('');
        expect(result.data.return_code).toBe(0);
        expect(result.data.execution_time_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('passes code to sandbox client', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await executeCodeHandler({ code: 'x = 1' }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'x = 1' })
      );
    });
  });

  describe('input validation', () => {
    it('returns error when neither code nor skill_script provided', async () => {
      const result = await executeCodeHandler({}, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('code');
        expect(result.error.message).toContain('skill_script');
      }
    });

    it('returns error for invalid skill_script format', async () => {
      const result = await executeCodeHandler(
        { skill_script: 'invalid_format' },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Invalid skill_script format');
      }
    });
  });

  describe('timeout handling (AC#7)', () => {
    it('uses default timeout of 30s', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await executeCodeHandler({ code: 'pass' }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30 })
      );
    });

    it('respects custom timeout', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await executeCodeHandler({ code: 'pass', timeout: 60 }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 60 })
      );
    });

    it('caps timeout at 120s max', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await executeCodeHandler({ code: 'pass', timeout: 300 }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120 })
      );
    });
  });

  describe('error handling (AC#6)', () => {
    it('returns error gracefully when sandbox fails', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockRejectedValue(
        new Error('Sandbox connection failed')
      );

      const result = await executeCodeHandler({ code: 'pass' }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Sandbox connection failed');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('never throws exceptions (project-context.md mandate)', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockRejectedValue(
        new Error('Unexpected error')
      );

      // Should not throw
      await expect(
        executeCodeHandler({ code: 'pass' }, mockContext)
      ).resolves.toBeDefined();
    });
  });

  describe('result capture (AC#5)', () => {
    it('captures stdout, stderr, and return_code', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'output',
        stderr: 'warning',
        return_code: 1,
      });

      const result = await executeCodeHandler({ code: 'print("x")' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe('output');
        expect(result.data.stderr).toBe('warning');
        expect(result.data.return_code).toBe(1);
      }
    });

    it('includes execution_time_ms in result', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      const result = await executeCodeHandler({ code: 'pass' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.execution_time_ms).toBe('number');
      }
    });
  });
});

describe('registerExecuteCodeTool', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('registers execute_code tool with registry', () => {
    registerExecuteCodeTool();

    const tool = toolRegistry.getStaticTool('execute_code');
    expect(tool).toBeDefined();
    expect(tool?.claudeTool.name).toBe('execute_code');
  });
});

