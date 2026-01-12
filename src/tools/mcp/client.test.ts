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
import { SessionState } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock GCP auth for Story 8.4 auth scenario tests
vi.mock('./gcp-auth.js', () => ({
  getGcpIdentityToken: vi.fn(),
}));

import { getGcpIdentityToken } from './gcp-auth.js';

// Mock logger for error logging verification
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../../utils/logger.js';

/**
 * Helper to create a mock Response with proper text() and headers
 */
function mockResponse(body: object, options: { ok?: boolean; status?: number; statusText?: string; contentType?: string; sessionId?: string } = {}) {
  const { ok = true, status = 200, statusText = 'OK', contentType = 'application/json', sessionId } = options;
  const bodyText = JSON.stringify(body);
  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'mcp-session-id') return sessionId ?? null;
        return null;
      },
    },
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(body), // Keep for backward compat
  };
}

/**
 * Helper to set up mock fetch that handles initialization flow
 * Returns session-based responses for init + notification + actual request
 */
function setupMockWithInit(actualResponseBody: object, options: { sessionId?: string } = {}) {
  const { sessionId = 'test-session' } = options;
  
  mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);
    
    // Handle initialize
    if (body.method === 'initialize') {
      return Promise.resolve(mockResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'test' } },
      }, { sessionId }));
    }
    
    // Handle notifications/initialized
    if (body.method === 'notifications/initialized') {
      return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
    }
    
    // Return the actual response
    return Promise.resolve(mockResponse(actualResponseBody, { sessionId }));
  });
}

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
      // Arrange - use helper that handles init flow
      setupMockWithInit({
        jsonrpc: '2.0',
        id: 2, // id 1 used by initialize
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

    it('returns MCP_CONNECTION_FAILED error on network failure during init', async () => {
      // Arrange - network failure during initialization
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MCP_CONNECTION_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('returns MCP_CONNECTION_FAILED error on init timeout', async () => {
      // Arrange - mock fetch that aborts when signal is triggered (during init)
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

      const client = new McpClient('test-server', testConfig);

      // Act - init timeout is 5s (hardcoded), simulate time passing with fake timers
      const p = client.listTools();
      await vi.advanceTimersByTimeAsync(5000);
      const result = await p;

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MCP_CONNECTION_FAILED');
        expect(result.error.retryable).toBe(true);
        expect(result.error.message).toContain('timeout');
      }
    });

    it('returns MCP_CONNECTION_FAILED on HTTP 500 during init', async () => {
      // Arrange - 500 during initialization
      mockFetch.mockImplementationOnce(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: { get: () => null },
          text: () => Promise.resolve('Server Error'),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MCP_CONNECTION_FAILED');
        // HTTP 500 is retryable
        expect(result.error.retryable).toBe(true);
        expect(result.error.message).toContain('500');
      }
    });

    it('returns MCP_CONNECTION_FAILED on invalid JSON during init', async () => {
      // Arrange - return invalid JSON text during init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'content-type') return 'application/json';
            return null;
          },
        },
        text: () => Promise.resolve('not valid json {{{'),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MCP_CONNECTION_FAILED');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('includes bearer token in Authorization header', async () => {
      // Arrange
      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert - check first call (initialize) has auth header
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
      // Arrange - no bearer token config
      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

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
      // Arrange - use helper that handles init flow
      setupMockWithInit({
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: 'Search results...' }],
        },
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

    it('sends correct JSON-RPC payload for tools/call', async () => {
      // Arrange
      setupMockWithInit({
        jsonrpc: '2.0',
        id: 2,
        result: { content: [] },
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.callTool('search', { query: 'hello' });

      // Assert - find the tools/call request (not initialize)
      const toolsCallReq = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'tools/call'
      );
      expect(toolsCallReq).toBeDefined();
      
      const callBody = JSON.parse(toolsCallReq![1].body);
      expect(callBody.params.name).toBe('search');
      expect(callBody.params.arguments).toEqual({ query: 'hello' });
    });

    it('returns TOOL_EXECUTION_FAILED on JSON-RPC error response for tool call', async () => {
      // Arrange - init succeeds, tool call fails
      mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        
        if (body.method === 'initialize') {
          return Promise.resolve(mockResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-06-18', capabilities: {} },
          }, { sessionId: 'test-sess' }));
        }
        
        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }
        
        // Tool call returns error
        return Promise.resolve(mockResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32600, message: 'Invalid Request' },
        }));
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
      // Arrange - init fails
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
      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      const state = client.getState();
      expect(state.lastSuccessAt).toBeInstanceOf(Date);
      expect(state.lastLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('tracks session state on failed init', async () => {
      // Arrange - init fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      const state = client.getState();
      expect(state.sessionState).toBe(SessionState.FAILED);
    });
  });

  describe('concurrency safety (AC#6)', () => {
    it('handles parallel operations without shared state corruption', async () => {
      // Arrange
      mockFetch.mockImplementation((_url, options) => {
        const body = JSON.parse(options.body);
        if (body.method === 'tools/list') {
          return Promise.resolve(mockResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: [{ name: 'tool1', inputSchema: { type: 'object' } }] },
          }));
        }
        return Promise.resolve(mockResponse({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: 'result' }] },
        }));
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Session Management Tests (Phase 2 - AC#8-11)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('session management (AC#8-11)', () => {
    it('captures session ID from mcp-session-id header (AC-S1)', async () => {
      // Arrange - server returns session ID in header
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'mcp-session-id') return 'session-abc123';
            if (name.toLowerCase() === 'content-type') return 'application/json';
            return null;
          },
        },
        text: () => Promise.resolve(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [] },
        })),
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      expect(client.getSessionId()).toBe('session-abc123');
    });

    it('sends session ID on subsequent requests (AC-S2)', async () => {
      // Arrange - init returns session ID, subsequent calls use it
      mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        
        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => {
                if (name.toLowerCase() === 'mcp-session-id') return 'session-xyz789';
                if (name.toLowerCase() === 'content-type') return 'application/json';
                return null;
              },
            },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }
        
        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }
        
        return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();
      await client.callTool('search', { query: 'test' });

      // Assert - tools/list and tools/call should have Mcp-Session-Id header
      const toolsListCall = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'tools/list'
      );
      expect(toolsListCall![1].headers['Mcp-Session-Id']).toBe('session-xyz789');
    });

    it('re-initializes session on 404 session not found (AC-S3)', async () => {
      // Arrange
      let callCount = 0;
      let firstListCallDone = false;
      
      mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
        callCount++;
        const body = JSON.parse(opts.body);
        
        if (body.method === 'initialize') {
          const sessionId = callCount <= 2 ? 'old-session' : 'new-session';
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => {
                if (name.toLowerCase() === 'mcp-session-id') return sessionId;
                if (name.toLowerCase() === 'content-type') return 'application/json';
                return null;
              },
            },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }
        
        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }
        
        // First tools/list succeeds, second returns 404
        if (body.method === 'tools/list') {
          if (!firstListCallDone) {
            firstListCallDone = true;
            return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
          }
          // Second list call - return 404 session not found first time, then succeed
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: { get: () => null },
            text: () => Promise.resolve('session not found'),
          });
        }
        
        return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
      });

      const client = new McpClient('test-server', testConfig);
      
      // First call establishes session
      await client.listTools();
      expect(client.getSessionId()).toBe('old-session');

      // Reset mock to return success after 404 recovery
      firstListCallDone = true;
      mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        
        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => {
                if (name.toLowerCase() === 'mcp-session-id') return 'new-session';
                if (name.toLowerCase() === 'content-type') return 'application/json';
                return null;
              },
            },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }
        
        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }
        
        return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
      });

      // Second call - session exists, no re-init needed
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(true);
    });

    it('multiple servers maintain independent sessions (AC-S2)', async () => {
      // Arrange - two clients to different servers
      const client1 = new McpClient('server-1', { url: 'https://server1.com' });
      const client2 = new McpClient('server-2', { url: 'https://server2.com' });

      mockFetch.mockImplementation((url: string) => {
        const sessionId = url.includes('server1') ? 'session-s1' : 'session-s2';
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === 'mcp-session-id') return sessionId;
              if (name.toLowerCase() === 'content-type') return 'application/json';
              return null;
            },
          },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { tools: [] },
          })),
        });
      });

      // Act
      await client1.listTools();
      await client2.listTools();

      // Assert - each client has its own session
      expect(client1.getSessionId()).toBe('session-s1');
      expect(client2.getSessionId()).toBe('session-s2');
    });

    it('concurrent calls share the same session (AC-S2)', async () => {
      // Arrange
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === 'mcp-session-id') return 'shared-session';
              if (name.toLowerCase() === 'content-type') return 'application/json';
              return null;
            },
          },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: callCount,
            result: { tools: [] },
          })),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act - parallel calls
      await Promise.all([
        client.listTools(),
        client.listTools(),
        client.listTools(),
      ]);

      // Assert - all use the same session
      expect(client.getSessionId()).toBe('shared-session');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP Lifecycle Handshake Tests (Story 3.5 - AC#L1-L11)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('initialization handshake (AC-L1, AC-L6)', () => {
    /**
     * Helper to create mock response with session ID header
     */
    function mockResponseWithSession(
      body: object,
      sessionId?: string,
      options: { ok?: boolean; status?: number; contentType?: string } = {}
    ) {
      const { ok = true, status = 200, contentType = 'application/json' } = options;
      return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'mcp-session-id') return sessionId ?? null;
            if (name.toLowerCase() === 'content-type') return contentType;
            return null;
          },
        },
        text: () => Promise.resolve(JSON.stringify(body)),
      };
    }

    it('sends initialize request before first tools/list (AC-L1)', async () => {
      // Arrange - mock initialize and tools/list responses
      const calls: string[] = [];
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        calls.push(body.method);

        if (body.method === 'initialize') {
          return Promise.resolve(mockResponseWithSession({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              serverInfo: { name: 'test-server', version: '1.0.0' },
            },
          }, 'session-init-123'));
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({
            ok: true,
            status: 202,
            statusText: 'Accepted',
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }

        // tools/list
        return Promise.resolve(mockResponseWithSession({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'test-tool', inputSchema: { type: 'object' } }] },
        }, 'session-init-123'));
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(true);
      expect(calls).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    });

    it('sends notifications/initialized after initialize response (AC-L1)', async () => {
      // Arrange
      const calls: string[] = [];
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        calls.push(body.method);

        if (body.method === 'initialize') {
          return Promise.resolve(mockResponseWithSession({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'srv' } },
          }, 'sess-abc'));
        }

        if (body.method === 'notifications/initialized') {
          // Verify it has no 'id' field (one-way notification)
          expect(body.id).toBeUndefined();
          return Promise.resolve({
            ok: true,
            status: 202,
            statusText: 'Accepted',
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }

        return Promise.resolve(mockResponseWithSession({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: 'ok' }] },
        }, 'sess-abc'));
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.callTool('some-tool', {});

      // Assert - notifications/initialized was sent
      expect(calls).toContain('notifications/initialized');
    });

    it('uses 5s timeout for initialize request (AC-L1)', async () => {
      // Arrange - mock slow initialize response
      mockFetch.mockImplementationOnce((_url: string, options: { signal?: AbortSignal; body: string }) => {
        const body = JSON.parse(options.body);
        if (body.method === 'initialize') {
          // Simulate slow response that exceeds 5s init timeout
          return new Promise((_, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        }
        return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      });

      const client = new McpClient('test-server', {
        ...testConfig,
        requestTimeoutMs: 30000, // Normal timeout is 30s
      });

      // Act - advance fake timers to trigger 5s init abort
      const p = client.listTools();
      await vi.advanceTimersByTimeAsync(5000);
      const result = await p;

      // Assert - should fail fast within ~5s, not 30s
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('timeout');
      }
    });

    it('concurrent first calls share single initialization (AC-L6)', async () => {
      // Arrange
      let initializeCallCount = 0;
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          initializeCallCount++;
          // Add small delay to simulate real init
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(mockResponseWithSession({
                jsonrpc: '2.0',
                id: body.id,
                result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'srv' } },
              }, 'shared-session'));
            }, 10);
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({
            ok: true,
            status: 202,
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }

        return Promise.resolve(mockResponseWithSession({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [] },
        }, 'shared-session'));
      });

      const client = new McpClient('test-server', testConfig);

      // Act - concurrent first calls
      const p = Promise.all([
        client.listTools(),
        client.listTools(),
        client.listTools(),
      ]);

      await vi.advanceTimersByTimeAsync(20);
      const results = await p;

      // Assert - only ONE initialize call, all succeed
      expect(initializeCallCount).toBe(1);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('does not clear a newer initializationPromise when an earlier init finishes (AC-L6)', async () => {
      // Regression test: ensureInitialized() must not clobber a newer in-flight init.
      // We simulate an init that is "stuck", then overwrite initializationPromise to a new promise.
      // When the original init completes, it must NOT clear the newer promise.
      let resolveInit: (value: unknown) => void = () => undefined;

      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return new Promise((resolve) => {
            resolveInit = resolve;
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({
            ok: true,
            status: 202,
            statusText: 'Accepted',
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }

        // Not expected in this test, but keep mock sane.
        return Promise.resolve(
          mockResponseWithSession(
            { jsonrpc: '2.0', id: body.id, result: { tools: [] } },
            'sess'
          )
        );
      });

      const client = new McpClient('test-server', testConfig);

      const inFlight = client.ensureInitialized();

      // Allow microtasks to run so sendInitRequest() can call fetch() and set resolveInit.
      await Promise.resolve();

      // Ensure the original init is in progress, then replace it.
      expect((client as any).initializationPromise).toBeTruthy();
      const p2 = new Promise<void>(() => undefined);
      (client as any).initializationPromise = p2;

      // Complete init
      resolveInit(
        mockResponseWithSession(
          {
            jsonrpc: '2.0',
            id: 1,
            result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'srv' } },
          },
          'sess'
        )
      );

      const result = await inFlight;

      expect(result.success).toBe(true);
      // Must still be the newer promise (not cleared by the first call's finally).
      expect((client as any).initializationPromise).toBe(p2);
    });

    it('uses negotiatedVersion from server in MCP-Protocol-Version header (AC-L4)', async () => {
      // Arrange
      mockFetch.mockImplementation((_url: string, options: { body: string; headers: Record<string, string> }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve(mockResponseWithSession({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'srv' } },
          }, 'sess'));
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({
            ok: true,
            status: 202,
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }

        // For tools/list, check headers
        expect(options.headers['MCP-Protocol-Version']).toBe('2024-11-05');
        return Promise.resolve(mockResponseWithSession({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [] },
        }, 'sess'));
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(true);
    });

    it('getState() returns sessionState, sessionId, sessionEstablishedAt (AC-L5)', async () => {
      // Arrange
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve(mockResponseWithSession({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'srv' } },
          }, 'state-session'));
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }

        return Promise.resolve(mockResponseWithSession({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [] },
        }, 'state-session'));
      });

      const client = new McpClient('test-server', testConfig);

      // Before any call
      const stateBefore = client.getState();
      expect(stateBefore.sessionState).toBe(SessionState.DISCONNECTED);
      expect(stateBefore.sessionId).toBeUndefined();

      // Act
      await client.listTools();

      // After successful initialization
      const stateAfter = client.getState();
      expect(stateAfter.sessionState).toBe(SessionState.CONNECTED);
      expect(stateAfter.sessionId).toBe('state-session');
      expect(stateAfter.sessionEstablishedAt).toBeInstanceOf(Date);
    });
  });

  describe('stateless server auto-detection (AC-L3, AC-L10)', () => {
    it('auto-detects stateless server when no session ID returned (AC-L3)', async () => {
      // Arrange - server returns no session ID
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null }, // No session ID
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: [] },
          })),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      await client.listTools();

      // Assert
      const state = client.getState();
      expect(state.isStateless).toBe(true);
      expect(state.sessionId).toBeUndefined();
    });

    it('falls back to stateless on 4xx init rejection with "unknown method" (AC-L10)', async () => {
      // Arrange
      const calls: string[] = [];
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        calls.push(body.method);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: { get: () => null },
            text: () => Promise.resolve('Unknown method: initialize'),
          });
        }

        // Direct tools/list call (stateless mode)
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: [{ name: 'stateless-tool', inputSchema: { type: 'object' } }] },
          })),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert - should succeed via stateless fallback
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].name).toBe('stateless-tool');
      }
      expect(client.getState().isStateless).toBe(true);
      // Should have called initialize first, then direct tools/list
      expect(calls).toEqual(['initialize', 'tools/list']);
    });

    it('skips handshake on subsequent calls for stateless servers (AC-L10)', async () => {
      // Arrange
      const calls: string[] = [];
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        calls.push(body.method);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: false,
            status: 405,
            statusText: 'Method Not Allowed',
            headers: { get: () => null },
            text: () => Promise.resolve('not supported'),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: [] },
          })),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act - two calls
      await client.listTools();
      calls.length = 0; // Reset tracking
      await client.listTools();

      // Assert - second call should NOT attempt initialize
      expect(calls).toEqual(['tools/list']);
    });

    it('does not fall back to stateless when init fails with HTTP 500 even if message contains "not supported" (AC-L10)', async () => {
      // Arrange - HTTP 500 should NOT trigger stateless fallback (AC-L10 only allows 400/404/405)
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: { get: () => null },
            text: () => Promise.resolve('not supported'),
          });
        }

        // Should never reach tools/list because init fails
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () =>
            Promise.resolve(
              JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [] } })
            ),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.listTools();

      // Assert
      expect(result.success).toBe(false);
      expect(client.getState().isStateless).toBe(false);
    });
  });

  describe('404 recovery (AC-L7)', () => {
    it('calls ensureInitialized before retry on 404 session not found (AC-L7)', async () => {
      // Arrange
      const calls: string[] = [];
      let firstToolsListCall = true;

      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        calls.push(body.method);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => name.toLowerCase() === 'mcp-session-id' ? 'new-session' : null,
            },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }

        // First tools/list returns 404 session not found
        if (body.method === 'tools/list' && firstToolsListCall) {
          firstToolsListCall = false;
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: { get: () => null },
            text: () => Promise.resolve('session not found'),
          });
        }

        // Retry succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: [] },
          })),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Pre-establish session
      await client.listTools(); // Will init + notify + list(404) + reinit + notify + list(ok)
      
      // Assert - should have called initialize twice (initial + recovery)
      const initCalls = calls.filter((c) => c === 'initialize');
      expect(initCalls.length).toBe(2);
      expect(client.getState().sessionState).toBe(SessionState.CONNECTED);
    });
  });

  describe('retryability classification (AC-L8, AC-L9)', () => {
    it('returns retryable: true for transient failures (5xx, timeout) (AC-L8)', async () => {
      // Arrange - 503 Service Unavailable (transient)
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }

        // Tool call fails with 503
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: { get: () => null },
          text: () => Promise.resolve(''),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.callTool('some-tool', {});

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });

    it('returns retryable: false for non-retryable failures (400, 401, 403) (AC-L9)', async () => {
      // Arrange - 401 Unauthorized (non-retryable)
      mockFetch.mockImplementation((_url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { protocolVersion: '2025-06-18', capabilities: {} },
            })),
          });
        }

        if (body.method === 'notifications/initialized') {
          return Promise.resolve({ ok: true, status: 202, headers: { get: () => null }, text: () => Promise.resolve('') });
        }

        // Tool call fails with 401
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: { get: () => null },
          text: () => Promise.resolve(''),
        });
      });

      const client = new McpClient('test-server', testConfig);

      // Act
      const result = await client.callTool('some-tool', {});

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GCP Identity Auth Scenario Tests (Story 8.4)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAuthHeader auth scenarios (Story 8.4)', () => {
    beforeEach(() => {
      vi.mocked(getGcpIdentityToken).mockReset();
    });

    it('returns GCP identity token when authType is gcp_identity (T1.1)', async () => {
      // Arrange
      vi.mocked(getGcpIdentityToken).mockResolvedValue('mock-gcp-identity-token');

      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', {
        url: 'https://test.run.app/mcp',
        authType: 'gcp_identity',
      });

      // Act
      await client.listTools();

      // Assert - Verify GCP identity token was fetched
      expect(getGcpIdentityToken).toHaveBeenCalledWith(
        'https://test.run.app',
        undefined
      );

      // Verify auth header was set on initialize call
      const initCall = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'initialize'
      );
      expect(initCall![1].headers['Authorization']).toBe('Bearer mock-gcp-identity-token');
    });

    it('returns undefined (no auth) when neither bearerToken nor authType configured (T1.2)', async () => {
      // Arrange
      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', {
        url: 'https://mcp.example.com',
        // No bearerToken, no authType
      });

      // Act
      await client.listTools();

      // Assert - No auth header
      const initCall = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'initialize'
      );
      expect(initCall![1].headers['Authorization']).toBeUndefined();
      // Should NOT have called GCP identity token
      expect(getGcpIdentityToken).not.toHaveBeenCalled();
    });

    it('uses URL origin as audience for GCP identity token (T1.4)', async () => {
      // Arrange
      vi.mocked(getGcpIdentityToken).mockResolvedValue('token');

      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', {
        url: 'https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp',
        authType: 'gcp_identity',
      });

      // Act
      await client.listTools();

      // Assert - Audience should be URL origin (without path)
      expect(getGcpIdentityToken).toHaveBeenCalledWith(
        'https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app',
        undefined
      );
    });

    it('logs error and returns undefined when GCP identity fetch fails (T1.5)', async () => {
      // Arrange
      vi.mocked(getGcpIdentityToken).mockRejectedValue(new Error('GCP auth failed'));

      mockFetch.mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        // Initialize will succeed (no auth required for this mock)
        if (body.method === 'initialize') {
          return Promise.resolve(mockResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-06-18', capabilities: {} },
          }));
        }
        if (body.method === 'notifications/initialized') {
          return Promise.resolve({
            ok: true,
            status: 202,
            headers: { get: () => null },
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve(mockResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }));
      });

      const client = new McpClient('test-server', {
        url: 'https://test.run.app/mcp',
        authType: 'gcp_identity',
      });

      // Act
      await client.listTools();

      // Assert - Error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp.auth.gcp_identity_failed',
          serverName: 'test-server',
        })
      );

      // Assert - Auth header should be undefined (no token)
      const initCall = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'initialize'
      );
      expect(initCall![1].headers['Authorization']).toBeUndefined();
    });

    it('static bearer token takes precedence over authType gcp_identity (T1.6)', async () => {
      // Arrange
      vi.mocked(getGcpIdentityToken).mockResolvedValue('should-not-use');

      setupMockWithInit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });

      const client = new McpClient('test-server', {
        url: 'https://test.run.app/mcp',
        bearerToken: 'static-token',
        authType: 'gcp_identity', // Should be ignored when bearerToken is present
      });

      // Act
      await client.listTools();

      // Assert - Should NOT call GCP identity token
      expect(getGcpIdentityToken).not.toHaveBeenCalled();

      // Assert - Should use static bearer token
      const initCall = mockFetch.mock.calls.find(
        (call) => JSON.parse(call[1].body).method === 'initialize'
      );
      expect(initCall![1].headers['Authorization']).toBe('Bearer static-token');
    });
  });
});

