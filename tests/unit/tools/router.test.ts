import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { toolRegistry } from '@/tools/registry.js';
import { resetMcpClientManager } from '@/tools/mcp/manager.js';

const callToolMock = vi.fn();

vi.mock('@/tools/mcp/client.js', () => ({
  McpClient: vi.fn(() => ({
    callTool: callToolMock,
    getServerName: () => 'rube',
    getSessionId: () => 'session-mock',
    getState: () => ({}),
    listTools: vi.fn().mockResolvedValue({ success: true, data: [] }),
  })),
}));

vi.mock('@/config/mcp-servers.js', () => ({
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

/**
 * Helper to register an MCP tool in the registry (mimics what discovery does).
 */
function registerMcpTool(serverName: string, toolName: string) {
  toolRegistry.registerMcpTools(serverName, [
    {
      originalName: toolName,
      claudeTool: {
        name: `${serverName}__${toolName}`,
        input_schema: { type: 'object', properties: {} },
      },
    },
  ]);
}

describe('executeToolCall (router)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
    resetMcpClientManager(); // Reset client manager between tests
    callToolMock.mockReset();
  });

  afterEach(() => {
    resetMcpClientManager();
  });

  it('returns TOOL_NOT_FOUND for unknown tools', async () => {
    const { executeToolCall } = await import('@/tools/router.js');

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
    const { executeToolCall } = await import('@/tools/router.js');

    // Register the tool first - this is what discovery does
    registerMcpTool('rube', 'search');

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
    const { executeToolCall } = await import('@/tools/router.js');

    // Register the tool first
    registerMcpTool('rube', 'search');

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
    const { executeToolCall } = await import('@/tools/router.js');

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

  it('reuses cached client for multiple tool calls to same server (AC-C2)', async () => {
    const { McpClient } = await import('@/tools/mcp/client.js');
    const { executeToolCall } = await import('@/tools/router.js');

    // Register the tool first
    registerMcpTool('rube', 'search');

    // Clear mock call counts for this specific test
    vi.mocked(McpClient).mockClear();

    callToolMock.mockResolvedValue({
      success: true,
      data: { content: [{ type: 'text', text: 'ok' }] },
    });

    // Make multiple calls
    await executeToolCall({
      toolName: 'rube__search',
      toolUseId: 'toolu_a',
      args: { query: 'first' },
      traceId: 'trace-a',
      signal: new AbortController().signal,
    });

    await executeToolCall({
      toolName: 'rube__search',
      toolUseId: 'toolu_b',
      args: { query: 'second' },
      traceId: 'trace-b',
      signal: new AbortController().signal,
    });

    // McpClient should only be constructed once (same client reused)
    expect(McpClient).toHaveBeenCalledTimes(1);
    // But callTool should be called twice
    expect(callToolMock).toHaveBeenCalledTimes(2);
  });
});
