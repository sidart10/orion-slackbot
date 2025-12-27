/**
 * Tests for Tool Configuration
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#1 - Define MCP tool schemas for Anthropic tool format
 */

import { beforeEach, describe, it, expect } from 'vitest';
import { getToolDefinitions, rubeMcpConfig, type ToolDefinition } from './tools.js';
import { toolRegistry } from '../tools/registry.js';

describe('getToolDefinitions', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('should return an array of tool definitions', () => {
    const tools = getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should return empty array initially (no registry entries)', () => {
    const tools = getToolDefinitions();
    expect(tools).toEqual([]);
  });

  it('should pass through MCP tool definitions from the registry', () => {
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

    const tools = getToolDefinitions();
    expect(tools.map((t) => t.name)).toContain('rube__search');
  });
});

describe('rubeMcpConfig', () => {
  it('should have command and args for MCP server', () => {
    expect(rubeMcpConfig.command).toBe('npx');
    expect(rubeMcpConfig.args).toContain('-y');
    expect(rubeMcpConfig.args).toContain('@composio/mcp');
  });

  it('should have description', () => {
    expect(rubeMcpConfig.description).toBeTruthy();
    expect(typeof rubeMcpConfig.description).toBe('string');
  });
});

describe('ToolDefinition type', () => {
  it('should match Anthropic Tool type structure', () => {
    // This test validates the type structure without actual implementation
    const mockTool: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    };

    expect(mockTool.name).toBe('test_tool');
    expect(mockTool.description).toBe('A test tool');
    expect(mockTool.input_schema.type).toBe('object');
  });
});

