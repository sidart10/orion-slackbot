/**
 * Vercel Sandbox Runtime Tests
 *
 * Tests for the Vercel Sandbox integration that runs Anthropic SDK
 * in an isolated environment with proper timeout handling.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock dependencies before imports
vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: vi.fn(),
  },
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  })),
}));

vi.mock('../observability/langfuse', () => {
  const mockSpan = { end: vi.fn() };
  const mockTrace = {
    span: vi.fn().mockReturnValue(mockSpan),
    update: vi.fn(),
  };
  return {
    getLangfuse: vi.fn().mockReturnValue({
      trace: vi.fn().mockReturnValue(mockTrace),
    }),
  };
});

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { Sandbox } from '@vercel/sandbox';
import { WebClient } from '@slack/web-api';
import {
  executeAgentInSandbox,
  parseAgentOutput,
  type SandboxExecutionInput,
} from './vercel-runtime.js';
import { getLangfuse } from '../observability/langfuse.js';

describe('vercel-runtime', () => {
  const mockCommandResult = {
    exitCode: 0,
    stdout: vi.fn().mockResolvedValue(JSON.stringify({
      text: 'Hello! How can I help you today?',
      tokenUsage: { input: 10, output: 20 },
    })),
    stderr: vi.fn().mockResolvedValue(''),
  };

  const mockSandbox = {
    sandboxId: 'test-sandbox-123',
    runCommand: vi.fn().mockResolvedValue(mockCommandResult),
    writeFiles: vi.fn(),
    stop: vi.fn(),
  };

  const validInput: SandboxExecutionInput = {
    userMessage: 'Hello, Orion!',
    threadHistory: [],
    slackChannel: 'C123456',
    slackMessageTs: '1234567890.123456',
    slackToken: 'xoxb-test-token',
    traceId: 'trace-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock command result
    mockCommandResult.exitCode = 0;
    mockCommandResult.stdout.mockResolvedValue(JSON.stringify({
      text: 'Hello! How can I help you today?',
      tokenUsage: { input: 10, output: 20 },
    }));
    mockCommandResult.stderr.mockResolvedValue('');
    
    (Sandbox.create as Mock).mockResolvedValue(mockSandbox);
    mockSandbox.runCommand.mockResolvedValue(mockCommandResult);
    mockSandbox.writeFiles.mockResolvedValue(undefined);
    mockSandbox.stop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseAgentOutput', () => {
    it('should parse valid JSON response with text and token usage', () => {
      const stdout = JSON.stringify({
        text: 'Hello!',
        tokenUsage: { input: 10, output: 20 },
      });

      const result = parseAgentOutput(stdout);

      expect(result.text).toBe('Hello!');
      expect(result.tokenUsage).toEqual({ input: 10, output: 20 });
      expect(result.error).toBeUndefined();
    });

    it('should parse error response from agent', () => {
      const stdout = JSON.stringify({
        error: 'rate_limit_exceeded',
      });

      const result = parseAgentOutput(stdout);

      expect(result.text).toBe('');
      expect(result.error).toBe('rate_limit_exceeded');
    });

    it('should handle raw text output (non-JSON)', () => {
      const stdout = 'This is plain text output';

      const result = parseAgentOutput(stdout);

      expect(result.text).toBe('This is plain text output');
      expect(result.tokenUsage).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should handle empty string', () => {
      const result = parseAgentOutput('');

      expect(result.text).toBe('');
    });
  });

  describe('executeAgentInSandbox', () => {
    it('should execute successfully and return response (AC#1)', async () => {
      const result = await executeAgentInSandbox(validInput);

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello! How can I help you today?');
      expect(result.tokenUsage).toEqual({ input: 10, output: 20 });
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should create sandbox with correct configuration', async () => {
      await executeAgentInSandbox(validInput);

      expect(Sandbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: { vcpus: 4 },
          runtime: 'node22',
        })
      );
    });

    it('should install Anthropic SDK in sandbox (AC#2)', async () => {
      await executeAgentInSandbox(validInput);

      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'npm',
          args: ['install', '@anthropic-ai/sdk'],
        })
      );
    });

    it('should write agent script to sandbox filesystem', async () => {
      await executeAgentInSandbox(validInput);

      expect(mockSandbox.writeFiles).toHaveBeenCalledWith([
        expect.objectContaining({
          path: '/vercel/sandbox/agent.mjs',
        }),
      ]);
    });

    it('should execute agent script with node', async () => {
      await executeAgentInSandbox(validInput);

      expect(mockSandbox.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'node',
          args: ['agent.mjs'],
        })
      );
    });

    it('should update Slack message on success (AC#3)', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ ok: true });
      (WebClient as unknown as Mock).mockImplementation(() => ({
        chat: { update: mockUpdate },
      }));

      await executeAgentInSandbox(validInput);

      expect(WebClient).toHaveBeenCalledWith(validInput.slackToken);
      expect(mockUpdate).toHaveBeenCalledWith({
        channel: validInput.slackChannel,
        ts: validInput.slackMessageTs,
        text: 'Hello! How can I help you today?',
      });
    });

    it('should stop sandbox after execution', async () => {
      await executeAgentInSandbox(validInput);

      expect(mockSandbox.stop).toHaveBeenCalled();
    });

    it('should create Langfuse trace for observability (AC#6)', async () => {
      await executeAgentInSandbox(validInput);

      // Verify getLangfuse was called (trace creation happens)
      expect(getLangfuse).toHaveBeenCalled();
    });

    describe('error handling (AC#4)', () => {
      it('should handle sandbox creation failure with SANDBOX_CREATION_FAILED', async () => {
        (Sandbox.create as Mock).mockRejectedValue(
          new Error('Failed to create sandbox')
        );

        const result = await executeAgentInSandbox(validInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to create sandbox');
      });

      it('should handle SDK install failure with SANDBOX_SETUP_FAILED', async () => {
        mockSandbox.runCommand.mockResolvedValueOnce({
          exitCode: 1,
          stdout: vi.fn().mockResolvedValue(''),
          stderr: vi.fn().mockResolvedValue('npm ERR! network error'),
        });

        const result = await executeAgentInSandbox(validInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain('npm install failed');
      });

      it('should handle agent execution failure with AGENT_EXECUTION_FAILED', async () => {
        // First call succeeds (npm install)
        mockSandbox.runCommand
          .mockResolvedValueOnce({
            exitCode: 0,
            stdout: vi.fn().mockResolvedValue(''),
            stderr: vi.fn().mockResolvedValue(''),
          })
          // Second call fails (node agent.mjs)
          .mockResolvedValueOnce({
            exitCode: 1,
            stdout: vi.fn().mockResolvedValue(''),
            stderr: vi.fn().mockResolvedValue('Error: Invalid API key'),
          });

        const result = await executeAgentInSandbox(validInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid API key');
      });

      it('should handle timeout errors with SANDBOX_TIMEOUT code', async () => {
        (Sandbox.create as Mock).mockRejectedValue(
          new Error('Sandbox timed out')
        );

        const result = await executeAgentInSandbox(validInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
      });

      it('should update Slack with error message on failure', async () => {
        const mockUpdate = vi.fn().mockResolvedValue({ ok: true });
        (WebClient as unknown as Mock).mockImplementation(() => ({
          chat: { update: mockUpdate },
        }));
        (Sandbox.create as Mock).mockRejectedValue(
          new Error('Failed to create sandbox')
        );

        await executeAgentInSandbox(validInput);

        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: validInput.slackChannel,
            ts: validInput.slackMessageTs,
          })
        );
      });

      it('should not throw if Slack update fails', async () => {
        const mockUpdate = vi
          .fn()
          .mockRejectedValue(new Error('Slack API error'));
        (WebClient as unknown as Mock).mockImplementation(() => ({
          chat: { update: mockUpdate },
        }));

        // Should not throw
        const result = await executeAgentInSandbox(validInput);

        expect(result.success).toBe(true);
      });

      it('should stop sandbox even on error', async () => {
        // Make npm install fail after sandbox is created
        mockSandbox.runCommand.mockResolvedValueOnce({
          exitCode: 1,
          stdout: vi.fn().mockResolvedValue(''),
          stderr: vi.fn().mockResolvedValue('npm ERR!'),
        });

        await executeAgentInSandbox(validInput);

        expect(mockSandbox.stop).toHaveBeenCalled();
      });
    });

    describe('retry logic (NFR15)', () => {
      it('should retry sandbox creation on transient failure', async () => {
        (Sandbox.create as Mock)
          .mockRejectedValueOnce(new Error('Transient error'))
          .mockResolvedValueOnce(mockSandbox);

        const result = await executeAgentInSandbox(validInput);

        expect(Sandbox.create).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
      });

      it('should give up after max retries', async () => {
        (Sandbox.create as Mock).mockRejectedValue(
          new Error('Persistent error')
        );

        const result = await executeAgentInSandbox(validInput);

        expect(Sandbox.create).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
        expect(result.success).toBe(false);
      });
    });

    describe('thread history handling', () => {
      it('should pass thread history to agent script', async () => {
        const inputWithHistory: SandboxExecutionInput = {
          ...validInput,
          threadHistory: ['Hello', 'Hi there!', 'How are you?'],
        };

        await executeAgentInSandbox(inputWithHistory);

        const writeFilesCall = mockSandbox.writeFiles.mock.calls[0][0][0];
        const scriptContent = writeFilesCall.content.toString();

        expect(scriptContent).toContain('Hello');
        expect(scriptContent).toContain('Hi there!');
        expect(scriptContent).toContain('How are you?');
      });
    });
  });
});

