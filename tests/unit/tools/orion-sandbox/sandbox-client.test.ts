/**
 * Tests for GKE Sandbox Client with K8s SandboxClaim Lifecycle.
 *
 * @see Story 6.2 - orion_sandbox Tool (GKE Agent Sandbox)
 * @see Tech-Spec: Fix Sandbox Client K8s Lifecycle
 * @see AC#1, AC#2, AC#3 - SandboxClaim lifecycle, headers, request format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeSandbox,
  SandboxTimeoutError,
  ClaimReadyTimeoutError,
  ClaimCreationError,
  __testing,
} from '@/tools/orion-sandbox/sandbox-client.js';
import type { SandboxClientDeps } from '@/tools/orion-sandbox/types.js';

// Mock config
vi.mock('@/config/environment.js', () => ({
  config: {
    gkeSandboxRouterUrl: 'http://test-sandbox-router:8080',
    gcpProjectId: 'test-project',
    gkeClusterName: 'test-cluster',
    gkeClusterRegion: 'us-central1',
  },
}));

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock fetch for K8s lifecycle
function createMockDeps(overrides?: Partial<SandboxClientDeps>): Required<SandboxClientDeps> {
  return {
    getK8sApiEndpoint: vi.fn().mockResolvedValue('https://test-k8s-api.example.com'),
    getK8sAccessToken: vi.fn().mockResolvedValue('test-token-123'),
    fetch: vi.fn(),
    ...overrides,
  };
}

// Helper to create Ready claim response
function createReadyClaim(claimName: string) {
  return {
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: { name: claimName, namespace: 'default' },
    spec: { sandboxTemplateRef: { name: 'python-runtime-template' } },
    status: {
      conditions: [{ type: 'Ready', status: 'True' as const }],
    },
  };
}

// Helper to create Creating claim response
function createCreatingClaim(claimName: string) {
  return {
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: { name: claimName, namespace: 'default' },
    spec: { sandboxTemplateRef: { name: 'python-runtime-template' } },
    status: {
      conditions: [
        { type: 'Ready', status: 'False' as const, reason: 'Creating', message: 'Provisioning' },
      ],
    },
  };
}

// Helper to create Failed claim response
function createFailedClaim(claimName: string, message: string) {
  return {
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: { name: claimName, namespace: 'default' },
    spec: { sandboxTemplateRef: { name: 'python-runtime-template' } },
    status: {
      conditions: [{ type: 'Ready', status: 'False' as const, reason: 'Failed', message }],
    },
  };
}

describe('executeSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('K8s SandboxClaim lifecycle (AC#1)', () => {
    it('creates SandboxClaim, waits for ready, executes, and deletes', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Call 1: Create SandboxClaim - POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      // Call 2: Get SandboxClaim (polling) - Ready immediately
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });

      // Call 3: Execute code - POST to router
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '4\n', stderr: '', exit_code: 0 }),
      });

      // Call 4: Delete SandboxClaim - DELETE
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await executeSandbox({ code: 'print(2+2)', timeout: 30 }, deps);

      expect(result.stdout).toBe('4\n');
      expect(result.stderr).toBe('');
      expect(result.return_code).toBe(0);

      // Verify 4 fetch calls were made
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify create call
      expect(mockFetch.mock.calls[0][0]).toContain('/sandboxclaims');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');

      // Verify get call (polling)
      expect(mockFetch.mock.calls[1][1].method).toBeUndefined(); // GET is default

      // Verify execute call (POST to router)
      expect(mockFetch.mock.calls[2][0]).toBe('http://test-sandbox-router:8080/execute');
      expect(mockFetch.mock.calls[2][1].method).toBe('POST');

      // Verify delete call
      expect(mockFetch.mock.calls[3][1].method).toBe('DELETE');
    });

    it('generates unique claim names for concurrent safety', async () => {
      const claimNames: string[] = [];

      for (let i = 0; i < 10; i++) {
        claimNames.push(__testing.generateClaimName());
      }

      // All names should be unique
      const uniqueNames = new Set(claimNames);
      expect(uniqueNames.size).toBe(10);

      // All names should match pattern
      for (const name of claimNames) {
        expect(name).toMatch(/^orion-exec-\d+-[a-z0-9]{5}$/);
      }
    });

    it('only deletes claim if it was successfully created', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Access denied',
      });

      await expect(
        executeSandbox({ code: 'print(1)', timeout: 30 }, deps)
      ).rejects.toThrow(ClaimCreationError);

      // Only 1 call (create) - no delete attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('correct HTTP headers (AC#2)', () => {
    it('sends required headers to sandbox router', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: 'pass', timeout: 30 }, deps);

      // Verify router execute call (3rd call)
      const executeCall = mockFetch.mock.calls[2];
      const headers = executeCall[1].headers;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Sandbox-ID']).toMatch(/^orion-exec-/);
      expect(headers['X-Sandbox-Namespace']).toBe('default');
      expect(headers['X-Sandbox-Port']).toBe('8888');
    });

    it('sends Authorization header to K8s API', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: 'pass', timeout: 30 }, deps);

      // Verify K8s API calls have Authorization header
      const createHeaders = mockFetch.mock.calls[0][1].headers;
      expect(createHeaders.Authorization).toBe('Bearer test-token-123');

      const getHeaders = mockFetch.mock.calls[1][1].headers;
      expect(getHeaders.Authorization).toBe('Bearer test-token-123');
    });
  });

  describe('correct request format (AC#3)', () => {
    it('sends command format, not code format', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '4\n', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: 'print(2+2)', timeout: 30 }, deps);

      // Verify execute call body
      const executeCall = mockFetch.mock.calls[2];
      const body = JSON.parse(executeCall[1].body);

      // Should have command, not code
      expect(body.command).toContain("python3 -c 'print(2+2)'");
      expect(body.code).toBeUndefined();
    });

    it('escapes single quotes in Python code', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: "print('hello')", timeout: 30 }, deps);

      const executeCall = mockFetch.mock.calls[2];
      const body = JSON.parse(executeCall[1].body);

      // Single quotes should be escaped for shell
      expect(body.command).toContain("'\"'\"'");
    });
  });

  describe('SandboxClaim creation', () => {
    it('creates claim with correct spec', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: 'pass', timeout: 30 }, deps);

      // Verify create call body
      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);

      expect(body.apiVersion).toBe('extensions.agents.x-k8s.io/v1alpha1');
      expect(body.kind).toBe('SandboxClaim');
      expect(body.metadata.namespace).toBe('default');
      expect(body.spec.sandboxTemplateRef.name).toBe('python-runtime-template');
    });

    it('throws ClaimCreationError on failure', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Quota exceeded',
      });

      await expect(
        executeSandbox({ code: 'pass', timeout: 30 }, deps)
      ).rejects.toThrow(ClaimCreationError);
    });
  });

  describe('claim ready polling', () => {
    it('polls until Ready condition is True', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get 1 (creating)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createCreatingClaim('orion-exec-test'),
      });
      // Get 2 (creating)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createCreatingClaim('orion-exec-test'),
      });
      // Get 3 (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: '', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox({ code: 'pass', timeout: 30 }, deps);

      // Should have polled 3 times
      expect(mockFetch).toHaveBeenCalledTimes(6); // create + 3 polls + execute + delete
    });

    it('throws error if claim fails', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (failed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createFailedClaim('orion-exec-test', 'ImagePullBackOff'),
      });
      // Delete (cleanup still happens)
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'pass', timeout: 30 }, deps)
      ).rejects.toThrow('SandboxClaim failed: ImagePullBackOff');

      // Verify cleanup was attempted
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('timeout handling (AC#7)', () => {
    it('throws SandboxTimeoutError on execution timeout', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute times out
      const timeoutError = new Error('timeout');
      timeoutError.name = 'TimeoutError';
      mockFetch.mockRejectedValueOnce(timeoutError);
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'import time; time.sleep(100)', timeout: 30 }, deps)
      ).rejects.toThrow(SandboxTimeoutError);
    });

    it('includes timeout value in error message', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute times out
      const timeoutError = new Error('timeout');
      timeoutError.name = 'TimeoutError';
      mockFetch.mockRejectedValueOnce(timeoutError);
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'pass', timeout: 45 }, deps)
      ).rejects.toThrow('Sandbox execution timed out after 45s');
    });

    it('converts AbortError to SandboxTimeoutError', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute aborted
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'pass', timeout: 30 }, deps)
      ).rejects.toThrow(SandboxTimeoutError);
    });
  });

  describe('error handling', () => {
    it('throws on router error', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Router crashed',
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'pass', timeout: 30 }, deps)
      ).rejects.toThrow('Sandbox execution failed: 500 Internal Server Error');
    });

    it('handles missing stdout/stderr/return_code gracefully', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await executeSandbox({ code: 'pass', timeout: 30 }, deps);

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.return_code).toBe(0);
    });

    it('cleans up claim even on execution error', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        executeSandbox({ code: 'pass', timeout: 30 }, deps)
      ).rejects.toThrow('Network error');

      // Verify delete was still called
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[3][1].method).toBe('DELETE');
    });

    it('does not throw on delete failure (graceful cleanup)', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: 'ok', stderr: '', exit_code: 0 }),
      });
      // Delete fails
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

      // Should still succeed - delete failure is non-fatal
      const result = await executeSandbox({ code: 'pass', timeout: 30 }, deps);
      expect(result.stdout).toBe('ok');
    });
  });

  describe('custom error classes', () => {
    it('SandboxTimeoutError has isTimeout property', () => {
      const error = new SandboxTimeoutError(30);
      expect(error.isTimeout).toBe(true);
      expect(error.name).toBe('SandboxTimeoutError');
    });

    it('ClaimReadyTimeoutError has isClaimTimeout property', () => {
      const error = new ClaimReadyTimeoutError(10);
      expect(error.isClaimTimeout).toBe(true);
      expect(error.name).toBe('ClaimReadyTimeoutError');
    });

    it('ClaimCreationError has statusCode property', () => {
      const error = new ClaimCreationError('Failed', 403);
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('ClaimCreationError');
    });
  });

  describe('environment variable support (Issue #1 fix)', () => {
    it('passes environment variables as shell exports', async () => {
      const mockFetch = vi.fn();
      const deps = createMockDeps({ fetch: mockFetch });

      // Create
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Get (ready)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createReadyClaim('orion-exec-test'),
      });
      // Execute
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stdout: 'test-value', stderr: '', exit_code: 0 }),
      });
      // Delete
      mockFetch.mockResolvedValueOnce({ ok: true });

      await executeSandbox(
        {
          code: 'import os; print(os.environ.get("MY_VAR"))',
          timeout: 30,
          env: { MY_VAR: 'test-value' },
        },
        deps
      );

      // Verify execute call body includes env exports
      const executeCall = mockFetch.mock.calls[2];
      const body = JSON.parse(executeCall[1].body);

      expect(body.command).toContain("export MY_VAR='test-value'");
      expect(body.command).toContain('&&');
      expect(body.command).toContain('python3 -c');
    });

    it('handles multiple env vars', async () => {
      const command = __testing.buildShellCommand('print(1)', {
        VAR1: 'val1',
        VAR2: 'val2',
      });

      expect(command).toContain("export VAR1='val1'");
      expect(command).toContain("export VAR2='val2'");
      expect(command).toContain("python3 -c 'print(1)'");
    });

    it('escapes single quotes in env var values', () => {
      const command = __testing.buildShellCommand('print(1)', {
        VAR: "it's a test",
      });

      expect(command).toContain("'\"'\"'");
    });

    it('returns plain python command when no env vars', () => {
      const command = __testing.buildShellCommand('print(1)', undefined);
      expect(command).toBe("python3 -c 'print(1)'");

      const command2 = __testing.buildShellCommand('print(1)', {});
      expect(command2).toBe("python3 -c 'print(1)'");
    });
  });
});

describe('API response validation (Issue #2 fix)', () => {
  // Extract validation functions to help TypeScript resolve assertion signatures
  const validateGkeClusterInfo: (data: unknown) => void = __testing.validateGkeClusterInfo;
  const validateSandboxClaim: (data: unknown) => void = __testing.validateSandboxClaim;
  const validateSandboxExecutionResponse: (data: unknown) => void = __testing.validateSandboxExecutionResponse;

  describe('validateGkeClusterInfo', () => {
    it('accepts valid cluster info', () => {
      expect(() => {
        validateGkeClusterInfo({
          endpoint: '34.123.45.67',
          masterAuth: {
            clusterCaCertificate: 'base64cert==',
          },
        });
      }).not.toThrow();
    });

    it('accepts minimal cluster info', () => {
      expect(() => {
        validateGkeClusterInfo({});
      }).not.toThrow();
    });

    it('rejects non-object', () => {
      expect(() => {
        validateGkeClusterInfo(null);
      }).toThrow('expected object');

      expect(() => {
        validateGkeClusterInfo('string');
      }).toThrow('expected object');
    });

    it('rejects non-string endpoint', () => {
      expect(() => {
        validateGkeClusterInfo({ endpoint: 123 });
      }).toThrow('endpoint must be string');
    });

    it('rejects non-object masterAuth', () => {
      expect(() => {
        validateGkeClusterInfo({ masterAuth: 'invalid' });
      }).toThrow('masterAuth must be object');
    });

    it('rejects non-string clusterCaCertificate', () => {
      expect(() => {
        validateGkeClusterInfo({
          masterAuth: { clusterCaCertificate: 123 },
        });
      }).toThrow('clusterCaCertificate must be string');
    });
  });

  describe('validateSandboxClaim', () => {
    it('accepts valid claim', () => {
      expect(() => {
        validateSandboxClaim({
          apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
          kind: 'SandboxClaim',
          metadata: { name: 'test', namespace: 'default' },
          spec: { sandboxTemplateRef: { name: 'python' } },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
          },
        });
      }).not.toThrow();
    });

    it('accepts claim without status', () => {
      expect(() => {
        validateSandboxClaim({
          apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
          kind: 'SandboxClaim',
          metadata: { name: 'test', namespace: 'default' },
          spec: { sandboxTemplateRef: { name: 'python' } },
        });
      }).not.toThrow();
    });

    it('rejects non-object', () => {
      expect(() => {
        validateSandboxClaim(null);
      }).toThrow('expected object');
    });

    it('rejects missing apiVersion', () => {
      expect(() => {
        validateSandboxClaim({
          kind: 'SandboxClaim',
          metadata: {},
        });
      }).toThrow('missing apiVersion');
    });

    it('rejects missing kind', () => {
      expect(() => {
        validateSandboxClaim({
          apiVersion: 'v1',
          metadata: {},
        });
      }).toThrow('missing kind');
    });

    it('rejects missing metadata', () => {
      expect(() => {
        validateSandboxClaim({
          apiVersion: 'v1',
          kind: 'SandboxClaim',
        });
      }).toThrow('missing metadata');
    });

    it('rejects non-array conditions', () => {
      expect(() => {
        validateSandboxClaim({
          apiVersion: 'v1',
          kind: 'SandboxClaim',
          metadata: {},
          status: { conditions: 'invalid' },
        });
      }).toThrow('conditions must be array');
    });
  });

  describe('validateSandboxExecutionResponse', () => {
    it('accepts valid response', () => {
      expect(() => {
        validateSandboxExecutionResponse({
          stdout: 'hello',
          stderr: '',
          exit_code: 0,
        });
      }).not.toThrow();
    });

    it('accepts empty response', () => {
      expect(() => {
        validateSandboxExecutionResponse({});
      }).not.toThrow();
    });

    it('rejects non-object', () => {
      expect(() => {
        validateSandboxExecutionResponse(null);
      }).toThrow('expected object');
    });

    it('rejects non-string stdout', () => {
      expect(() => {
        validateSandboxExecutionResponse({ stdout: 123 });
      }).toThrow('stdout must be string');
    });

    it('rejects non-string stderr', () => {
      expect(() => {
        validateSandboxExecutionResponse({ stderr: 123 });
      }).toThrow('stderr must be string');
    });

    it('rejects non-number exit_code', () => {
      expect(() => {
        validateSandboxExecutionResponse({ exit_code: '0' });
      }).toThrow('exit_code must be number');
    });
  });
});

describe('cache state management (Issue #3 fix)', () => {
  beforeEach(() => {
    __testing.clearCache();
  });

  it('getCacheState returns initial empty state', () => {
    const state = __testing.getCacheState();
    expect(state.endpoint).toBeNull();
    expect(state.hasDispatcher).toBe(false);
  });

  it('clearCache resets both endpoint and dispatcher', () => {
    // Note: We can't easily test the populated state without mocking
    // initializeK8sConnection, but we can verify clearCache works
    __testing.clearCache();
    const state = __testing.getCacheState();
    expect(state.endpoint).toBeNull();
    expect(state.hasDispatcher).toBe(false);
  });
});
