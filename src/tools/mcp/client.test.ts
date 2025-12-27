/**
 * MCP Client Tests
 *
 * Tests for MCP HTTP Streamable Transport client.
 *
 * @see Story 3.1 - Generic MCP Client
 * @see AC#1 - JSON-RPC over HTTP with lazy connection
 * @see AC#2 - listTools() returns ToolResult<McpTool[]>
 * @see AC#4 - callTool() returns ToolResult<McpContent>
 * @see AC#5 - Error handling with ToolErrorCode and retryable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient } from './client.js';
import type { McpClientConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('McpClient', () => {
  const testConfig: McpClientConfig = {
    url: 'https://mcp.example.com',
    bearerToken: 'test-token',
    requestTimeoutMs: 30000,
    connectionTimeoutMs: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('listTools()', () => {
    it('returns success with tool list on valid response', async () => {
      // Arrange
      const mockTools = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
              },
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTools),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('search');
        expect(result.data[0].description).toBe('Search the web');
      }
    });

    it('returns TOOL_UNAVAILABLE error on network failure', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('returns TOOL_UNAVAILABLE error on timeout', async () => {
      // Arrange - mock fetch that aborts when signal is triggered
      mockFetch.mockImplementationOnce((_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          // Listen for abort signal
          options?.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      });

      // Use real timers for this test since we need actual timeout behavior
      vi.useRealTimers();

      const client = new McpClient('test-server', {
        ...testConfig,
        requestTimeoutMs: 50, // Very short timeout
      });

      // Act
      const result = await client.listTools();

      // Restore fake timers for other tests
      vi.useFakeTimers();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
        expect(result.error.message).toContain('timeout');
      }
    });

    it('returns TOOL_EXECUTION_FAILED on HTTP 500', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('returns TOOL_EXECUTION_FAILED on invalid JSON', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Unexpected token')),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('includes bearer token in Authorization header', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { tools: [] } }),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('works without bearer token (optional auth)', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { tools: [] } }),
      });

      const client = new McpClient('test-server', {
        url: 'https://mcp.example.com',
        // No bearerToken
      });

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(true);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('callTool()', () => {
    it('returns success with content on valid response', async () => {
      // Arrange
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: 'Search results...' }],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.callTool('search', { query: 'hello' });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toHaveLength(1);
        expect(result.data.content[0].text).toBe('Search results...');
      }
    });

    it('sends correct JSON-RPC payload', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: { content: [] },
          }),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.callTool('search', { query: 'hello' });

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.example.com',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"method":"tools/call"'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.params.name).toBe('search');
      expect(callBody.params.arguments).toEqual({ query: 'hello' });
    });

    it('returns TOOL_EXECUTION_FAILED on JSON-RPC error response', async () => {
      // Arrange
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.callTool('invalid-tool', {});

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Invalid Request');
      }
    });

    it('never throws, always returns ToolResult', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new McpClient('test-server', testConfig);

      // Act & Assert - should not throw
      const result = await client.callTool('search', { query: 'test' });
      expect(result.success).toBe(false);
    });
  });

  describe('client state', () => {
    it('tracks lastSuccessAt on successful call', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ jsonrpc: '2.0', id: 1, result: { tools: [] } }),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      const state = client.getState();
      expect(state.lastSuccessAt).toBeInstanceOf(Date);
      expect(state.lastLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('tracks lastError on failed call', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      const state = client.getState();
      expect(state.lastError).toContain('Connection refused');
      expect(state.lastErrorAt).toBeInstanceOf(Date);
    });
  });

  describe('concurrency safety (AC#6)', () => {
    it('handles parallel operations without shared state corruption', async () => {
      // Arrange
      mockFetch.mockImplementation((_url, options) => {
        const body = JSON.parse(options.body);
        if (body.method === 'tools/list') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: '2.0',
                id: body.id,
                result: { tools: [{ name: 'tool1', inputSchema: { type: 'object' } }] },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: '2.0',
              id: body.id,
              result: { content: [{ type: 'text', text: 'result' }] },
            }),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act - run operations in parallel
      const [listResult, callResult1, callResult2] = await Promise.all([
        client.listTools(),
        client.callTool('tool1', { arg: 'a' }),
        client.callTool('tool1', { arg: 'b' }),
      ]);

      // Assert
      expect(listResult.success).toBe(true);
      expect(callResult1.success).toBe(true);
      expect(callResult2.success).toBe(true);
    });
  });
});

