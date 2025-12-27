import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolResult } from '../../utils/tool-result.js';
import { toolRegistry } from '../registry.js';
import { discoverAllTools } from './discovery.js';
import { McpClient } from './client.js';

describe('discoverAllTools', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toolRegistry.__resetForTests();
    delete process.env.RUBE_MCP_ENABLED;
    delete process.env.RUBE_MCP_URL;
    delete process.env.RUBE_API_KEY;
  });

  it('returns TOOL_INVALID_INPUT for enabled server missing URL (Task 0 mapping)', async () => {
    process.env.RUBE_MCP_ENABLED = 'true';
    const result = await discoverAllTools('trace-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_INVALID_INPUT');
    }
  });

  it('removes disabled server tools on refresh (AC#6)', async () => {
    // Seed cached tools
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'Search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    // Server disabled
    process.env.RUBE_MCP_ENABLED = 'false';
    const result = await discoverAllTools('trace-test');
    expect(result.success).toBe(true);

    expect(toolRegistry.getMcpTool('rube__search')).toBeUndefined();
  });

  it('retains cached tools when discovery fails (AC#5)', async () => {
    process.env.RUBE_MCP_ENABLED = 'true';
    process.env.RUBE_MCP_URL = 'https://example.invalid/mcp';

    // Seed cache with a previously discovered tool.
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'Search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);
    toolRegistry.__setDiscoveryTimestampForTests('rube', 0);

    vi.spyOn(McpClient.prototype, 'listTools').mockResolvedValue({
      success: false,
      error: {
        code: 'TOOL_UNAVAILABLE',
        message: 'down',
        retryable: true,
      },
    } satisfies ToolResult<unknown> as ToolResult<never>);

    const result = await discoverAllTools('trace-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_UNAVAILABLE');
    }

    // Cached tool should remain available.
    expect(toolRegistry.getMcpTool('rube__search')).toBeDefined();
  });

  it('maps unexpected exceptions to TOOL_EXECUTION_FAILED (Task 0 mapping)', async () => {
    process.env.RUBE_MCP_ENABLED = 'true';
    process.env.RUBE_MCP_URL = 'https://example.invalid/mcp';

    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'Search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);
    toolRegistry.__setDiscoveryTimestampForTests('rube', 0);

    vi.spyOn(McpClient.prototype, 'listTools').mockRejectedValue(new Error('boom'));

    const result = await discoverAllTools('trace-test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
    }

    expect(toolRegistry.getMcpTool('rube__search')).toBeDefined();
  });

  it('does not re-discover within TTL window (AC#2)', async () => {
    process.env.RUBE_MCP_ENABLED = 'true';
    process.env.RUBE_MCP_URL = 'https://example.invalid/mcp';

    // Seed cache & mark discovery as fresh.
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'Search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);
    toolRegistry.__setDiscoveryTimestampForTests('rube', Date.now());

    const spy = vi.spyOn(McpClient.prototype, 'listTools');
    const result = await discoverAllTools('trace-test');
    expect(result.success).toBe(true);
    expect(spy).not.toHaveBeenCalled();

    // Cached tool still available.
    expect(toolRegistry.getMcpTool('rube__search')).toBeDefined();
  });
});


