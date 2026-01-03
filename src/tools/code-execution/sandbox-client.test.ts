/**
 * Tests for GKE Sandbox Client.
 *
 * @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
 * @see AC#1, AC#2 - Code runs in sandbox with network access
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSandbox } from './sandbox-client.js';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock config
vi.mock('../../config/environment.js', () => ({
  config: {
    gkeSandboxRouterUrl: 'http://test-sandbox-router:8080',
  },
}));

describe('executeSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful execution', () => {
    it('sends code to sandbox router and returns result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          stdout: 'Hello\n',
          stderr: '',
          return_code: 0,
        }),
      });

      const result = await executeSandbox({
        code: 'print("Hello")',
        timeout: 30,
      });

      expect(result.stdout).toBe('Hello\n');
      expect(result.stderr).toBe('');
      expect(result.return_code).toBe(0);
    });

    it('sends POST request to /execute endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', return_code: 0 }),
      });

      await executeSandbox({ code: 'pass', timeout: 30 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-sandbox-router:8080/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('sends code and timeout in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', return_code: 0 }),
      });

      await executeSandbox({ code: 'x = 1', timeout: 45 });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.code).toBe('x = 1');
      expect(body.timeout_seconds).toBe(45);
      expect(body.template).toBe('python-runtime-template');
    });

    it('passes environment variables when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', return_code: 0 }),
      });

      await executeSandbox({
        code: 'pass',
        timeout: 30,
        env: { ARGS: '{"key":"value"}' },
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.environment).toEqual({ ARGS: '{"key":"value"}' });
    });
  });

  describe('error handling', () => {
    it('throws error on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(executeSandbox({ code: 'pass', timeout: 30 })).rejects.toThrow(
        'Sandbox execution failed: 500 Internal Server Error'
      );
    });

    it('handles missing stdout/stderr/return_code gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}), // Empty response
      });

      const result = await executeSandbox({ code: 'pass', timeout: 30 });

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.return_code).toBe(0);
    });
  });

  describe('timeout configuration', () => {
    it('sets fetch signal timeout with buffer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', return_code: 0 }),
      });

      await executeSandbox({ code: 'pass', timeout: 30 });

      const call = mockFetch.mock.calls[0];
      // Signal should be set (AbortSignal.timeout)
      expect(call[1].signal).toBeDefined();
    });
  });
});

