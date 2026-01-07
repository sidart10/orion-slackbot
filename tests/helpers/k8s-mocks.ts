/**
 * Test Helpers for K8s API Mocking
 *
 * @see Tech-Spec: Fix GKE Sandbox Client (Story 6.2.1)
 * @see Task 6: Update tests with K8s API mocks
 *
 * These helpers provide realistic mock responses for K8s API calls
 * to support dependency injection testing pattern.
 */

import { faker } from '@faker-js/faker';

// ============================================================================
// K8s Resource Types (for test mocking)
// ============================================================================

/**
 * K8s SandboxClaim resource structure
 */
export interface MockSandboxClaim {
  apiVersion: 'extensions.agents.x-k8s.io/v1alpha1';
  kind: 'SandboxClaim';
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
  };
  spec: {
    sandboxTemplateRef: {
      name: string;
    };
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
  };
}

/**
 * K8s API error response
 */
export interface MockK8sError {
  kind: 'Status';
  apiVersion: 'v1';
  status: 'Failure';
  message: string;
  reason: string;
  code: number;
}

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Creates a mock SandboxClaim resource.
 *
 * @param overrides - Partial claim to override defaults
 * @returns Complete SandboxClaim resource
 *
 * @example
 * const claim = createMockSandboxClaim({ metadata: { name: 'test-claim' } });
 */
export function createMockSandboxClaim(
  overrides: Partial<{
    name: string;
    namespace: string;
    status: MockSandboxClaim['status'];
  }> = {}
): MockSandboxClaim {
  const name = overrides.name ?? `orion-exec-${Date.now()}-${faker.string.alphanumeric(5)}`;

  return {
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: {
      name,
      namespace: overrides.namespace ?? 'default',
      creationTimestamp: new Date().toISOString(),
    },
    spec: {
      sandboxTemplateRef: {
        name: 'python-runtime-template',
      },
    },
    status: overrides.status,
  };
}

/**
 * Creates a SandboxClaim in "Creating" state (not ready yet).
 */
export function createMockSandboxClaimCreating(name: string): MockSandboxClaim {
  return createMockSandboxClaim({
    name,
    status: {
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'Creating',
          message: 'Sandbox pod is being provisioned',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
  });
}

/**
 * Creates a SandboxClaim in "Ready" state (ready for execution).
 */
export function createMockSandboxClaimReady(name: string): MockSandboxClaim {
  return createMockSandboxClaim({
    name,
    status: {
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
  });
}

/**
 * Creates a SandboxClaim in "Failed" state (provisioning failed).
 */
export function createMockSandboxClaimFailed(name: string): MockSandboxClaim {
  return createMockSandboxClaim({
    name,
    status: {
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'Failed',
          message: 'Pod failed to start: ImagePullBackOff',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
  });
}

/**
 * Creates a K8s API error response.
 *
 * @param code - HTTP status code
 * @param reason - K8s reason string
 * @param message - Error message
 */
export function createMockK8sError(
  code: number,
  reason: string,
  message: string
): MockK8sError {
  return {
    kind: 'Status',
    apiVersion: 'v1',
    status: 'Failure',
    message,
    reason,
    code,
  };
}

// ============================================================================
// Mock Response Builders
// ============================================================================

/**
 * Creates a mock Response for K8s API calls.
 *
 * @param body - Response body (will be JSON.stringify'd)
 * @param status - HTTP status code
 */
export function createMockK8sResponse(
  body: unknown,
  status: number = 200
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Creates a mock Response for successful SandboxClaim creation.
 */
export function createMockClaimCreationResponse(claimName: string): Response {
  const claim = createMockSandboxClaim({ name: claimName });
  return createMockK8sResponse(claim, 201);
}

/**
 * Creates a mock Response for SandboxClaim status (creating).
 */
export function createMockClaimStatusCreatingResponse(claimName: string): Response {
  const claim = createMockSandboxClaimCreating(claimName);
  return createMockK8sResponse(claim, 200);
}

/**
 * Creates a mock Response for SandboxClaim status (ready).
 */
export function createMockClaimStatusReadyResponse(claimName: string): Response {
  const claim = createMockSandboxClaimReady(claimName);
  return createMockK8sResponse(claim, 200);
}

/**
 * Creates a mock Response for SandboxClaim deletion.
 */
export function createMockClaimDeletionResponse(): Response {
  return createMockK8sResponse({ status: 'Success' }, 200);
}

/**
 * Creates a mock Response for sandbox router execution.
 */
export function createMockRouterExecutionResponse(
  stdout: string,
  stderr: string = '',
  exitCode: number = 0
): Response {
  return createMockK8sResponse(
    {
      stdout,
      stderr,
      exit_code: exitCode,
    },
    200
  );
}

/**
 * Creates a mock Response for 400 Bad Request (missing headers).
 */
export function createMockRouterBadRequestResponse(detail: string): Response {
  return createMockK8sResponse({ detail }, 400);
}

// ============================================================================
// Mock Fetch Sequence Builder
// ============================================================================

/**
 * Builds a mock fetch sequence for a successful SandboxClaim lifecycle.
 *
 * Call sequence:
 * 1. POST /sandboxclaims - Create claim (201)
 * 2. GET /sandboxclaims/{name} - Status: Creating (200)
 * 3. GET /sandboxclaims/{name} - Status: Ready (200)
 * 4. POST /execute - Execute code (200)
 * 5. DELETE /sandboxclaims/{name} - Delete claim (200)
 *
 * @param claimName - Name of the claim to create
 * @param executionResult - Expected stdout from execution
 *
 * @example
 * const mockFetch = vi.fn();
 * mockFetch
 *   .mockResolvedValueOnce(createMockClaimCreationResponse('test-claim'))
 *   .mockResolvedValueOnce(createMockClaimStatusCreatingResponse('test-claim'))
 *   .mockResolvedValueOnce(createMockClaimStatusReadyResponse('test-claim'))
 *   .mockResolvedValueOnce(createMockRouterExecutionResponse('4\n'))
 *   .mockResolvedValueOnce(createMockClaimDeletionResponse());
 */
export function createMockFetchSequenceSuccess(
  claimName: string,
  executionResult: string
) {
  return [
    createMockClaimCreationResponse(claimName), // 1. Create
    createMockClaimStatusReadyResponse(claimName), // 2. Status check (ready immediately)
    createMockRouterExecutionResponse(executionResult), // 3. Execute
    createMockClaimDeletionResponse(), // 4. Delete
  ];
}

/**
 * Builds a mock fetch sequence with claim ready polling (2 attempts).
 *
 * Simulates claim taking 2 polls to become ready.
 */
export function createMockFetchSequenceWithPolling(
  claimName: string,
  executionResult: string
) {
  return [
    createMockClaimCreationResponse(claimName), // 1. Create
    createMockClaimStatusCreatingResponse(claimName), // 2. Status: Creating
    createMockClaimStatusReadyResponse(claimName), // 3. Status: Ready
    createMockRouterExecutionResponse(executionResult), // 4. Execute
    createMockClaimDeletionResponse(), // 5. Delete
  ];
}

/**
 * Builds a mock fetch sequence for claim creation failure.
 */
export function createMockFetchSequenceClaimCreationFailed() {
  return [
    createMockK8sResponse(
      createMockK8sError(403, 'Forbidden', 'Insufficient permissions'),
      403
    ),
  ];
}

/**
 * Builds a mock fetch sequence for claim ready timeout.
 *
 * Claim never becomes ready (keeps returning "Creating").
 */
export function createMockFetchSequenceClaimReadyTimeout(claimName: string) {
  // Return "Creating" status indefinitely
  return Array.from({ length: 30 }, () =>
    createMockClaimStatusCreatingResponse(claimName)
  );
}

/**
 * Builds a mock fetch sequence for execution failure (missing headers).
 */
export function createMockFetchSequenceExecutionMissingHeaders(claimName: string) {
  return [
    createMockClaimCreationResponse(claimName), // 1. Create
    createMockClaimStatusReadyResponse(claimName), // 2. Status: Ready
    createMockRouterBadRequestResponse('X-Sandbox-ID header is required'), // 3. Execute fails
    createMockClaimDeletionResponse(), // 4. Delete (cleanup)
  ];
}

// ============================================================================
// Dependency Injection Helpers
// ============================================================================

/**
 * Creates mock dependencies for sandbox client testing.
 *
 * @param overrides - Override specific dependencies
 * @returns Mock dependencies object
 *
 * @example
 * const deps = createMockSandboxDeps({
 *   fetch: mockFetch,
 * });
 *
 * await executeSandbox({ code: 'print(1)' }, deps);
 */
export function createMockSandboxDeps(overrides: {
  getK8sApiEndpoint?: () => Promise<string>;
  getK8sAccessToken?: () => Promise<string>;
  fetch?: typeof fetch;
} = {}) {
  return {
    getK8sApiEndpoint: overrides.getK8sApiEndpoint ?? (async () => 'https://mock-cluster'),
    getK8sAccessToken: overrides.getK8sAccessToken ?? (async () => 'mock-token-abc123'),
    fetch: overrides.fetch ?? (fetch as typeof fetch),
  };
}
