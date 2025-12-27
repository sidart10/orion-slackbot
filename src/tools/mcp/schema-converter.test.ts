/**
 * Schema Converter Tests
 *
 * Tests for converting MCP tool schemas to Anthropic tool definitions.
 *
 * @see Story 3.1 - Generic MCP Client
 * @see AC#3 - mcpToolToClaude() returns Anthropic tool with name server__tool
 */

import { describe, it, expect } from 'vitest';
import { mcpToolToClaude, parseClaudeToolName } from './schema-converter.js';
import type { McpTool } from './types.js';

describe('mcpToolToClaude', () => {
  describe('tool naming (AC#3)', () => {
    it('formats tool name as server__tool', () => {
      const mcpTool: McpTool = {
        name: 'search',
        description: 'Search the web',
        inputSchema: { type: 'object', properties: {} },
      };

      const result = mcpToolToClaude('my-server', mcpTool);

      expect(result.name).toBe('my-server__search');
    });

    it('handles server names with special characters', () => {
      const mcpTool: McpTool = {
        name: 'query',
        inputSchema: { type: 'object' },
      };

      const result = mcpToolToClaude('mcp-server-v2', mcpTool);

      expect(result.name).toBe('mcp-server-v2__query');
    });
  });

  describe('description preservation', () => {
    it('preserves tool description', () => {
      const mcpTool: McpTool = {
        name: 'search',
        description: 'Search the web for information',
        inputSchema: { type: 'object' },
      };

      const result = mcpToolToClaude('server', mcpTool);

      expect(result.description).toBe('Search the web for information');
    });

    it('handles missing description', () => {
      const mcpTool: McpTool = {
        name: 'search',
        inputSchema: { type: 'object' },
      };

      const result = mcpToolToClaude('server', mcpTool);

      expect(result.description).toBeUndefined();
    });
  });

  describe('basic schema conversion', () => {
    it('converts simple object schema', () => {
      const mcpTool: McpTool = {
        name: 'search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query'],
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      expect(result.input_schema.type).toBe('object');
      expect(result.input_schema.properties).toEqual({
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      });
      expect(result.input_schema.required).toEqual(['query']);
    });

    it('handles empty properties', () => {
      const mcpTool: McpTool = {
        name: 'ping',
        inputSchema: { type: 'object' },
      };

      const result = mcpToolToClaude('server', mcpTool);

      expect(result.input_schema.type).toBe('object');
      expect(result.input_schema.properties).toEqual({});
    });
  });

  describe('edge cases: nullable', () => {
    it('handles nullable property', () => {
      const mcpTool: McpTool = {
        name: 'update',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string', nullable: true },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      // Anthropic doesn't have nullable, so we convert to anyOf or type array
      const valueProp = result.input_schema.properties?.value;
      expect(valueProp).toBeDefined();
      // Either type array or anyOf pattern
      expect(
        (valueProp as { type?: string | string[] }).type === 'string' ||
          Array.isArray((valueProp as { type?: string | string[] }).type)
      ).toBe(true);
    });
  });

  describe('edge cases: enum', () => {
    it('preserves enum values', () => {
      const mcpTool: McpTool = {
        name: 'set-status',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'pending'],
              description: 'Status value',
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const statusProp = result.input_schema.properties?.status as {
        enum?: unknown[];
      };
      expect(statusProp?.enum).toEqual(['active', 'inactive', 'pending']);
    });
  });

  describe('edge cases: nested objects', () => {
    it('handles nested object properties', () => {
      const mcpTool: McpTool = {
        name: 'create-user',
        inputSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const userProp = result.input_schema.properties?.user as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(userProp?.type).toBe('object');
      expect(userProp?.properties?.name).toEqual({ type: 'string' });
    });
  });

  describe('edge cases: arrays', () => {
    it('handles array properties with items', () => {
      const mcpTool: McpTool = {
        name: 'process-items',
        inputSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of items to process',
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const itemsProp = result.input_schema.properties?.items as {
        type?: string;
        items?: { type?: string };
      };
      expect(itemsProp?.type).toBe('array');
      expect(itemsProp?.items?.type).toBe('string');
    });
  });

  describe('edge cases: oneOf / anyOf', () => {
    it('preserves oneOf schema', () => {
      const mcpTool: McpTool = {
        name: 'flexible-input',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              oneOf: [{ type: 'string' }, { type: 'number' }],
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const valueProp = result.input_schema.properties?.value as {
        oneOf?: unknown[];
      };
      expect(valueProp?.oneOf).toHaveLength(2);
    });

    it('preserves anyOf schema', () => {
      const mcpTool: McpTool = {
        name: 'flexible-input',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              anyOf: [{ type: 'string' }, { type: 'boolean' }],
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const valueProp = result.input_schema.properties?.value as {
        anyOf?: unknown[];
      };
      expect(valueProp?.anyOf).toHaveLength(2);
    });
  });

  describe('parameter descriptions preserved', () => {
    it('preserves all parameter descriptions', () => {
      const mcpTool: McpTool = {
        name: 'complex-tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
            options: {
              type: 'object',
              description: 'Search options',
              properties: {
                limit: { type: 'number', description: 'Max results to return' },
              },
            },
          },
        },
      };

      const result = mcpToolToClaude('server', mcpTool);

      const props = result.input_schema.properties as Record<
        string,
        { description?: string }
      >;
      expect(props.query?.description).toBe('The search query');
      expect(props.options?.description).toBe('Search options');
    });
  });
});

describe('parseClaudeToolName', () => {
  it('parses valid server__tool format', () => {
    const result = parseClaudeToolName('brave__search');
    expect(result).toEqual(['brave', 'search']);
  });

  it('handles server names with hyphens', () => {
    const result = parseClaudeToolName('mcp-server-v2__query');
    expect(result).toEqual(['mcp-server-v2', 'query']);
  });

  it('handles tool names with underscores', () => {
    const result = parseClaudeToolName('server__get_user_data');
    expect(result).toEqual(['server', 'get_user_data']);
  });

  it('returns null for invalid format without separator', () => {
    const result = parseClaudeToolName('invalid');
    expect(result).toBeNull();
  });

  it('returns null for empty server name', () => {
    const result = parseClaudeToolName('__tool');
    expect(result).toBeNull();
  });

  it('returns null for empty tool name', () => {
    const result = parseClaudeToolName('server__');
    expect(result).toBeNull();
  });

  it('uses first __ as separator (handles tool names with __)', () => {
    // Edge case: if tool name itself contains __, we use first __ as separator
    const result = parseClaudeToolName('server__tool__name');
    expect(result).toEqual(['server', 'tool__name']);
  });
});

