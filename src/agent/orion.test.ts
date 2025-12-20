/**
 * Tests for Orion Agent Core Module
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#1 - Message passed to Claude Agent SDK via query()
 * @see AC#3 - Response streamed back
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOrionAgent, runOrionAgentDirect, type AgentOptions, type AgentContext } from './orion.js';
import * as loopModule from './loop.js';
import * as loaderModule from './loader.js';
import * as toolsModule from './tools.js';
import * as langfuseModule from '../observability/langfuse.js';
import * as tracingModule from '../observability/tracing.js';
import * as loggerModule from '../utils/logger.js';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Mock dependencies
vi.mock('./loop.js');
vi.mock('./loader.js');
vi.mock('./tools.js');
vi.mock('../observability/langfuse.js');
vi.mock('../observability/tracing.js');
vi.mock('../utils/logger.js');
vi.mock('@anthropic-ai/claude-agent-sdk');

describe('runOrionAgent (with Agent Loop)', () => {
  const mockContext: AgentContext = {
    threadHistory: ['User: Hello', 'Orion: Hi there!'],
    userId: 'U123',
    channelId: 'C456',
    threadTs: '1234567890.123456',
    traceId: 'trace-789',
  };

  const mockOptions: AgentOptions = {
    context: mockContext,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(toolsModule.getToolConfig).mockReturnValue({
      mcpServers: { test: { command: 'node', args: [] } },
      allowedTools: ['Read', 'Write', 'Bash', 'mcp'],
    });

    vi.mocked(loopModule.executeAgentLoop).mockResolvedValue({
      content: 'Test response from loop',
      sources: [],
      verified: true,
      attemptCount: 1,
    });

    vi.mocked(loaderModule.loadAgentPrompt).mockResolvedValue('You are Orion, an AI assistant.');
    vi.mocked(langfuseModule.getPrompt).mockRejectedValue(new Error('Not configured'));
    
    // Mock logger methods to avoid errors
    vi.mocked(loggerModule.logger).info = vi.fn();
    vi.mocked(loggerModule.logger).warn = vi.fn();
    vi.mocked(loggerModule.logger).error = vi.fn();
  });

  it('should return an async generator', async () => {
    const generator = runOrionAgent('Test message', mockOptions);
    expect(generator).toBeDefined();
    expect(typeof generator[Symbol.asyncIterator]).toBe('function');
  });

  it('should yield response content from agent loop', async () => {
    vi.mocked(loopModule.executeAgentLoop).mockResolvedValue({
      content: 'Hello World!',
      sources: [],
      verified: true,
      attemptCount: 1,
    });

    const chunks: string[] = [];
    for await (const chunk of runOrionAgent('Test message', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toContain('Hello World!');
  });

  it('should include source citations when sources are present', async () => {
    vi.mocked(loopModule.executeAgentLoop).mockResolvedValue({
      content: 'Based on my research...',
      sources: [
        { type: 'thread', reference: 'Thread 123' },
        { type: 'file', reference: 'knowledge/test.md' },
      ],
      verified: true,
      attemptCount: 1,
    });

    const chunks: string[] = [];
    for await (const chunk of runOrionAgent('Test', mockOptions)) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('');
    expect(fullResponse).toContain('Sources:');
    expect(fullResponse).toContain('Thread 123');
  });
});

describe('runOrionAgentDirect (Legacy Direct SDK Access)', () => {
  const mockContext: AgentContext = {
    threadHistory: ['User: Hello', 'Orion: Hi there!'],
    userId: 'U123',
    channelId: 'C456',
    traceId: 'trace-789',
  };

  const mockOptions: AgentOptions = {
    context: mockContext,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    
    vi.mocked(toolsModule.getToolConfig).mockReturnValue({
      mcpServers: { test: { command: 'node', args: [] } },
      allowedTools: ['Read', 'Write', 'Bash', 'mcp'],
    });

    vi.mocked(loaderModule.loadAgentPrompt).mockResolvedValue('You are Orion, an AI assistant.');
    vi.mocked(langfuseModule.getPrompt).mockRejectedValue(new Error('Not configured'));
    
    // Setup startActiveObservation mock to execute callback
    vi.mocked(tracingModule.startActiveObservation).mockImplementation(async (ctx, cb) => {
      const trace = {
        update: vi.fn(),
        span: vi.fn(() => ({ end: vi.fn() })),
        generation: vi.fn(),
      } as any;
      return cb(trace);
    });

    vi.mocked(loggerModule.logger).info = vi.fn();
    vi.mocked(loggerModule.logger).warn = vi.fn();
  });

  it('should return an async generator', async () => {
    vi.mocked(query).mockReturnValue((async function* () { yield { type: 'text', content: 'Hello' }; })() as any);
    const generator = runOrionAgentDirect('Test message', mockOptions);
    expect(generator).toBeDefined();
    expect(typeof generator[Symbol.asyncIterator]).toBe('function');
  });

  it('should yield text chunks from agent response', async () => {
    vi.mocked(query).mockReturnValue((async function* () {
      yield { type: 'text', content: 'Hello ' };
      yield { type: 'text', content: 'World!' };
    })() as any);

    const chunks: string[] = [];
    for await (const chunk of runOrionAgentDirect('Test message', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'World!']);
  });

  it('should include tool configuration in query options', async () => {
    vi.mocked(query).mockReturnValue((async function* () { yield { type: 'text', content: 'Done' }; })() as any);

    const generator = runOrionAgentDirect('Test', mockOptions);
    for await (const _ of generator) {}

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          allowedTools: ['Read', 'Write', 'Bash', 'mcp'],
          mcpServers: {
            test: { command: 'node', args: [] }
          },
        }),
      })
    );
  });

  it('should wrap execution in startActiveObservation', async () => {
    vi.mocked(query).mockReturnValue((async function* () {})() as any);
    
    const generator = runOrionAgentDirect('Test', mockOptions);
    for await (const _ of generator) {}

    expect(tracingModule.startActiveObservation).toHaveBeenCalled();
  });
});
