import { beforeEach, describe, expect, it } from 'vitest';
import { toolRegistry, parseMcpToolName } from './registry.js';

describe('parseMcpToolName (Task 1)', () => {
  it('parses server__tool (split on first __ only)', () => {
    expect(parseMcpToolName('rube__search')).toEqual({
      serverName: 'rube',
      toolName: 'search',
    });

    expect(parseMcpToolName('rube__search__v2')).toEqual({
      serverName: 'rube',
      toolName: 'search__v2',
    });
  });

  it('rejects malformed names', () => {
    expect(parseMcpToolName('search')).toBeNull();
    expect(parseMcpToolName('__search')).toBeNull();
    expect(parseMcpToolName('rube__')).toBeNull();
  });
});

describe('ToolRegistry (Task 1 conflict policy)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('excludes MCP tool if its unprefixed name conflicts with a static tool name', () => {
    toolRegistry.registerStaticTool(
      'search',
      async () => ({}),
      {
        name: 'search',
        description: 'static search',
        input_schema: { type: 'object', properties: {} },
      }
    );

    const registered = toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    expect(registered).toBe(0);
    expect(toolRegistry.getMcpTool('rube__search')).toBeUndefined();
  });

  it('keeps same unprefixed tool name across multiple servers (distinct prefixes)', () => {
    const r1 = toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    const r2 = toolRegistry.registerMcpTools('exa', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'exa__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    expect(r1).toBe(1);
    expect(r2).toBe(1);
    expect(toolRegistry.getMcpTool('rube__search')).toBeDefined();
    expect(toolRegistry.getMcpTool('exa__search')).toBeDefined();
  });

  it('returns deterministic tool list ordering (sorted by name)', () => {
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'z',
        claudeTool: { name: 'rube__z', input_schema: { type: 'object', properties: {} } },
      },
      {
        originalName: 'a',
        claudeTool: { name: 'rube__a', input_schema: { type: 'object', properties: {} } },
      },
    ]);

    const names = toolRegistry.getToolsForClaude().map((t) => t.name);
    expect(names).toEqual(['rube__a', 'rube__z']);
  });

  it('sorts across static + MCP tools deterministically (Task 6)', () => {
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'bbb',
        claudeTool: { name: 'rube__bbb', input_schema: { type: 'object', properties: {} } },
      },
    ]);

    toolRegistry.registerStaticTool(
      'aaa',
      async () => ({}),
      { name: 'aaa', input_schema: { type: 'object', properties: {} } }
    );

    const names = toolRegistry.getToolsForClaude().map((t) => t.name);
    expect(names).toEqual(['aaa', 'rube__bbb']);
  });
});


