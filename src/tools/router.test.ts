import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolRegistry } from './registry.js';

const callToolMock = vi.fn();

vi.mock('./mcp/client.js', () => ({
  McpClient: vi.fn(() => ({
    callTool: callToolMock,
  })),
}));

vi.mock('../config/mcp-servers.js', () => ({
  getMcpServerConfigs: () => [
    {
      name: 'rube',
      url: 'https://example.com/mcp',
      enabled: true,
      bearerToken: 'token',
      connectionTimeoutMs: 10,
      requestTimeoutMs: 10,
    },
  ],
}));

describe('executeToolCall (router)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
    callToolMock.mockReset();
  });

  it('returns TOOL_NOT_FOUND for unknown tools', async () => {
    const { executeToolCall } = await import('./router.js');

    const result = await executeToolCall({
      toolName: 'nope',
      toolUseId: 'toolu_1',
      args: {},
      traceId: 'trace-1',
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_NOT_FOUND');
    }
  });

  it('routes MCP tool names (server__tool) to McpClient.callTool and passes AbortSignal', async () => {
    const { executeToolCall } = await import('./router.js');

    callToolMock.mockResolvedValueOnce({
      success: true,
      data: { content: [{ type: 'text', text: 'ok' }] },
    });

    const controller = new AbortController();

    const result = await executeToolCall({
      toolName: 'rube__search',
      toolUseId: 'toolu_2',
      args: { query: 'hi' },
      traceId: 'trace-2',
      signal: controller.signal,
    });

    expect(callToolMock).toHaveBeenCalledWith(
      'search',
      { query: 'hi' },
      'trace-2',
      undefined,
      controller.signal
    );
    expect(result.success).toBe(true);
  });

  it('converts MCP { isError: true } payloads into ToolResult error (no throw)', async () => {
    const { executeToolCall } = await import('./router.js');

    callToolMock.mockResolvedValueOnce({
      success: true,
      data: { isError: true, content: [{ type: 'text', text: 'bad' }] },
    });

    const result = await executeToolCall({
      toolName: 'rube__search',
      toolUseId: 'toolu_3',
      args: { query: 'x' },
      traceId: 'trace-3',
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
      expect(result.error.message).toContain('bad');
    }
  });

  it('routes static tools by registry handler', async () => {
    const { executeToolCall } = await import('./router.js');

    toolRegistry.registerStaticTool(
      'static_tool',
      async (input) => ({ echoed: input }),
      { name: 'static_tool', input_schema: { type: 'object', properties: {} } }
    );

    const result = await executeToolCall({
      toolName: 'static_tool',
      toolUseId: 'toolu_4',
      args: { a: 1 },
      traceId: 'trace-4',
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ echoed: { a: 1 } });
    }
  });
});


