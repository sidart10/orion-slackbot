/**
 * GKE Sandbox Client with K8s SandboxClaim Lifecycle
 *
 * Implements the complete K8s Agent Sandbox API lifecycle:
 * 1. Create SandboxClaim via K8s API
 * 2. Wait for claim Ready condition
 * 3. Execute code with proper headers
 * 4. Delete SandboxClaim (cleanup)
 *
 * @see Story 6.2 - orion_sandbox Tool (GKE Agent Sandbox)
 * @see Tech-Spec: Fix Sandbox Client K8s Lifecycle
 * @see infra/gke-sandbox/ for deployment manifests
 */

import { GoogleAuth } from 'google-auth-library';
import { Agent } from 'undici';
import { config } from '../../config/environment.js';
import { logger } from '../../utils/logger.js';
import type {
  SandboxOptions,
  SandboxResult,
  SandboxClaim,
  SandboxClientDeps,
} from './types.js';

// Constants for claim readiness polling
const CLAIM_READY_TIMEOUT_MS = 10_000; // 10 seconds
const CLAIM_READY_POLL_INTERVAL_MS = 500; // 500ms

// K8s API constants
const SANDBOX_API_GROUP = 'extensions.agents.x-k8s.io';
const SANDBOX_API_VERSION = 'v1alpha1';
const SANDBOX_NAMESPACE = 'default';
const SANDBOX_TEMPLATE = 'python-runtime-template';
const SANDBOX_PORT = '8888';

/**
 * Custom error for sandbox timeout.
 * Used to distinguish timeout from other errors in handler.
 */
export class SandboxTimeoutError extends Error {
  readonly isTimeout = true;
  constructor(timeoutSeconds: number) {
    super(`Sandbox execution timed out after ${timeoutSeconds}s`);
    this.name = 'SandboxTimeoutError';
  }
}

/**
 * Custom error for claim ready timeout.
 * Thrown when SandboxClaim doesn't become Ready within timeout.
 */
export class ClaimReadyTimeoutError extends Error {
  readonly isClaimTimeout = true;
  constructor(timeoutSeconds: number) {
    super(`SandboxClaim did not become ready within ${timeoutSeconds}s`);
    this.name = 'ClaimReadyTimeoutError';
  }
}

/**
 * Custom error for claim creation failure.
 */
export class ClaimCreationError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ClaimCreationError';
  }
}

/**
 * Custom error for sandbox router connectivity issues.
 * Provides helpful message for local development setup.
 */
export class SandboxRouterConnectionError extends Error {
  readonly isConnectionError = true;
  constructor(routerUrl: string, cause?: Error) {
    const isLocalhost = routerUrl.includes('localhost');
    const helpMessage = isLocalhost
      ? `\n\nFor local development, run: ./scripts/dev-sandbox-tunnel.sh`
      : `\n\nCheck that the sandbox router is deployed and accessible.`;
    super(`Cannot connect to sandbox router at ${routerUrl}${helpMessage}`, { cause });
    this.name = 'SandboxRouterConnectionError';
  }
}

// Default implementations for dependency injection
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Cache for K8s API endpoint and CA certificate (don't change during runtime)
let cachedK8sEndpoint: string | null = null;
let cachedK8sDispatcher: Agent | null = null;

/**
 * Get OAuth 2.0 access token for K8s API.
 * Uses Application Default Credentials (ADC) from Cloud Run service account.
 */
async function defaultGetK8sAccessToken(): Promise<string> {
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain GCP access token via ADC');
  }
  return token;
}

/**
 * GKE cluster info response from container.googleapis.com API
 */
interface GkeClusterInfo {
  endpoint?: string;
  masterAuth?: {
    clusterCaCertificate?: string; // Base64-encoded PEM certificate
  };
}

/**
 * Validate GKE cluster info response shape.
 * Throws descriptive error if response is invalid.
 */
function validateGkeClusterInfo(data: unknown): asserts data is GkeClusterInfo {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid GKE cluster response: expected object');
  }
  const cluster = data as Record<string, unknown>;
  if (cluster.endpoint !== undefined && typeof cluster.endpoint !== 'string') {
    throw new Error('Invalid GKE cluster response: endpoint must be string');
  }
  if (cluster.masterAuth !== undefined) {
    if (typeof cluster.masterAuth !== 'object' || cluster.masterAuth === null) {
      throw new Error('Invalid GKE cluster response: masterAuth must be object');
    }
    const masterAuth = cluster.masterAuth as Record<string, unknown>;
    if (
      masterAuth.clusterCaCertificate !== undefined &&
      typeof masterAuth.clusterCaCertificate !== 'string'
    ) {
      throw new Error(
        'Invalid GKE cluster response: clusterCaCertificate must be string'
      );
    }
  }
}

/**
 * Validate SandboxClaim response shape.
 * Throws descriptive error if response is invalid.
 */
function validateSandboxClaim(data: unknown): asserts data is SandboxClaim {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid SandboxClaim response: expected object');
  }
  const claim = data as Record<string, unknown>;
  if (typeof claim.apiVersion !== 'string') {
    throw new Error('Invalid SandboxClaim response: missing apiVersion');
  }
  if (typeof claim.kind !== 'string') {
    throw new Error('Invalid SandboxClaim response: missing kind');
  }
  if (!claim.metadata || typeof claim.metadata !== 'object') {
    throw new Error('Invalid SandboxClaim response: missing metadata');
  }
  // status is optional but if present, validate structure
  if (claim.status !== undefined) {
    if (typeof claim.status !== 'object' || claim.status === null) {
      throw new Error('Invalid SandboxClaim response: status must be object');
    }
    const status = claim.status as Record<string, unknown>;
    if (status.conditions !== undefined && !Array.isArray(status.conditions)) {
      throw new Error(
        'Invalid SandboxClaim response: conditions must be array'
      );
    }
  }
}

/**
 * Sandbox execution response from router.
 */
interface SandboxExecutionResponse {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

/**
 * Validate sandbox execution response shape.
 * Throws descriptive error if response is invalid.
 */
function validateSandboxExecutionResponse(
  data: unknown
): asserts data is SandboxExecutionResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid sandbox execution response: expected object');
  }
  const result = data as Record<string, unknown>;
  if (result.stdout !== undefined && typeof result.stdout !== 'string') {
    throw new Error(
      'Invalid sandbox execution response: stdout must be string'
    );
  }
  if (result.stderr !== undefined && typeof result.stderr !== 'string') {
    throw new Error(
      'Invalid sandbox execution response: stderr must be string'
    );
  }
  if (result.exit_code !== undefined && typeof result.exit_code !== 'number') {
    throw new Error(
      'Invalid sandbox execution response: exit_code must be number'
    );
  }
}

/**
 * Initialize K8s API endpoint and custom HTTPS dispatcher with cluster CA.
 *
 * GKE cluster endpoints use Google's internal CA which isn't in Node.js's
 * default trust store. This function:
 * 1. Fetches cluster info from GKE API (uses publicly trusted googleapis.com)
 * 2. Extracts the cluster's CA certificate
 * 3. Creates a custom undici Agent with that CA for secure TLS verification
 *
 * Results are cached since cluster endpoint/CA don't change during runtime.
 */
async function initializeK8sConnection(): Promise<{
  endpoint: string;
  dispatcher: Agent;
}> {
  if (cachedK8sEndpoint && cachedK8sDispatcher) {
    return { endpoint: cachedK8sEndpoint, dispatcher: cachedK8sDispatcher };
  }

  const { gcpProjectId, gkeClusterName, gkeClusterRegion } = config;
  const token = await defaultGetK8sAccessToken();

  // Fetch cluster info from GKE API (uses publicly trusted certificate)
  const gkeApiUrl = `https://container.googleapis.com/v1/projects/${gcpProjectId}/locations/${gkeClusterRegion}/clusters/${gkeClusterName}`;

  const response = await fetch(gkeApiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get GKE cluster info: ${response.status} ${response.statusText}`
    );
  }

  const clusterData = await response.json();
  validateGkeClusterInfo(clusterData);

  if (!clusterData.endpoint) {
    throw new Error('GKE cluster response missing endpoint');
  }

  if (!clusterData.masterAuth?.clusterCaCertificate) {
    throw new Error('GKE cluster response missing CA certificate');
  }

  // Decode the base64 CA certificate to PEM format
  // Note: masterAuth and clusterCaCertificate are guaranteed to exist due to check above
  const caCert = Buffer.from(
    clusterData.masterAuth!.clusterCaCertificate!,
    'base64'
  ).toString('utf-8');

  // Create custom dispatcher with the cluster's CA certificate
  cachedK8sDispatcher = new Agent({
    connect: {
      ca: caCert,
    },
  });

  cachedK8sEndpoint = `https://${clusterData.endpoint}`;

  logger.debug({
    event: 'sandbox.k8s.connection.initialized',
    endpoint: cachedK8sEndpoint,
    hasCaCert: true,
  });

  return { endpoint: cachedK8sEndpoint, dispatcher: cachedK8sDispatcher };
}

/**
 * Get K8s API endpoint.
 * Initializes connection on first call (fetches CA cert).
 */
async function defaultGetK8sApiEndpoint(): Promise<string> {
  const { endpoint } = await initializeK8sConnection();
  return endpoint;
}

/**
 * Get the custom HTTPS dispatcher with cluster CA.
 * Must be called after endpoint is initialized.
 */
function getK8sDispatcher(): Agent | undefined {
  return cachedK8sDispatcher ?? undefined;
}

/**
 * Generate unique claim name for concurrent-safe execution.
 */
function generateClaimName(): string {
  return `orion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Create a SandboxClaim resource in K8s.
 */
async function createSandboxClaim(
  claimName: string,
  deps: Required<SandboxClientDeps>
): Promise<void> {
  const endpoint = await deps.getK8sApiEndpoint();
  const token = await deps.getK8sAccessToken();

  const claimResource: SandboxClaim = {
    apiVersion: `${SANDBOX_API_GROUP}/${SANDBOX_API_VERSION}`,
    kind: 'SandboxClaim',
    metadata: {
      name: claimName,
      namespace: SANDBOX_NAMESPACE,
    },
    spec: {
      sandboxTemplateRef: {
        name: SANDBOX_TEMPLATE,
      },
    },
  };

  const url = `${endpoint}/apis/${SANDBOX_API_GROUP}/${SANDBOX_API_VERSION}/namespaces/${SANDBOX_NAMESPACE}/sandboxclaims`;

  // Use custom dispatcher with cluster CA for TLS verification
  const dispatcher = getK8sDispatcher();

  const response = await deps.fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(claimResource),
    ...(dispatcher && { dispatcher }),
  } as RequestInit);

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown');
    throw new ClaimCreationError(
      `Failed to create SandboxClaim: ${response.status} ${response.statusText} - ${body}`,
      response.status
    );
  }

  logger.debug({ event: 'sandbox.claim.created', claimName });
}

/**
 * Get a SandboxClaim resource from K8s.
 */
async function getSandboxClaim(
  claimName: string,
  deps: Required<SandboxClientDeps>
): Promise<SandboxClaim> {
  const endpoint = await deps.getK8sApiEndpoint();
  const token = await deps.getK8sAccessToken();

  const url = `${endpoint}/apis/${SANDBOX_API_GROUP}/${SANDBOX_API_VERSION}/namespaces/${SANDBOX_NAMESPACE}/sandboxclaims/${claimName}`;

  // Use custom dispatcher with cluster CA for TLS verification
  const dispatcher = getK8sDispatcher();

  const response = await deps.fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ...(dispatcher && { dispatcher }),
  } as RequestInit);

  if (!response.ok) {
    throw new Error(
      `Failed to get SandboxClaim: ${response.status} ${response.statusText}`
    );
  }

  const claimData = await response.json();
  validateSandboxClaim(claimData);
  return claimData;
}

/**
 * Wait for SandboxClaim to become Ready.
 * Polls every 500ms, times out after 10s.
 */
async function waitForClaimReady(
  claimName: string,
  deps: Required<SandboxClientDeps>,
  timeoutMs: number = CLAIM_READY_TIMEOUT_MS
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const claim = await getSandboxClaim(claimName, deps);
    const readyCondition = claim.status?.conditions?.find(
      (c) => c.type === 'Ready'
    );

    if (readyCondition?.status === 'True') {
      logger.debug({
        event: 'sandbox.claim.ready',
        claimName,
        waitTimeMs: Date.now() - startTime,
      });
      return; // SUCCESS
    }

    if (
      readyCondition?.status === 'False' &&
      readyCondition.reason === 'Failed'
    ) {
      throw new Error(`SandboxClaim failed: ${readyCondition.message}`);
    }

    // Still creating, keep polling
    await sleep(CLAIM_READY_POLL_INTERVAL_MS);
  }

  throw new ClaimReadyTimeoutError(timeoutMs / 1000);
}

/**
 * Delete a SandboxClaim resource from K8s.
 * Non-throwing - logs warning on failure (K8s GC will clean up).
 */
async function deleteSandboxClaim(
  claimName: string,
  deps: Required<SandboxClientDeps>
): Promise<void> {
  try {
    const endpoint = await deps.getK8sApiEndpoint();
    const token = await deps.getK8sAccessToken();

    const url = `${endpoint}/apis/${SANDBOX_API_GROUP}/${SANDBOX_API_VERSION}/namespaces/${SANDBOX_NAMESPACE}/sandboxclaims/${claimName}`;

    // Use custom dispatcher with cluster CA for TLS verification
    const dispatcher = getK8sDispatcher();

    const response = await deps.fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      ...(dispatcher && { dispatcher }),
    } as RequestInit);

    if (!response.ok && response.status !== 404) {
      logger.warn({
        event: 'sandbox.claim.delete.failed',
        claimName,
        status: response.status,
      });
    } else {
      logger.debug({ event: 'sandbox.claim.deleted', claimName });
    }
  } catch (err) {
    logger.warn({
      event: 'sandbox.claim.delete.error',
      claimName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Build shell command with optional environment variable exports.
 * Prepends `export VAR=val && ` for each env var before the python command.
 */
function buildShellCommand(code: string, env?: Record<string, string>): string {
  // Escape single quotes in code for shell command
  const escapedCode = code.replace(/'/g, "'\"'\"'");
  const pythonCmd = `python3 -c '${escapedCode}'`;

  if (!env || Object.keys(env).length === 0) {
    return pythonCmd;
  }

  // Build export statements for each env var
  // Escape single quotes in values, wrap in single quotes for safety
  const exports = Object.entries(env)
    .map(([key, value]) => {
      const escapedValue = value.replace(/'/g, "'\"'\"'");
      return `export ${key}='${escapedValue}'`;
    })
    .join(' && ');

  return `${exports} && ${pythonCmd}`;
}

/**
 * Execute command in sandbox via router.
 */
async function executeInSandbox(
  claimName: string,
  options: SandboxOptions,
  deps: Required<SandboxClientDeps>
): Promise<SandboxResult> {
  const routerUrl = config.gkeSandboxRouterUrl;

  // Build command with env vars if provided
  const command = buildShellCommand(options.code, options.env);

  let response: Response;
  try {
    response = await deps.fetch(`${routerUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sandbox-ID': claimName,
        'X-Sandbox-Namespace': SANDBOX_NAMESPACE,
        'X-Sandbox-Port': SANDBOX_PORT,
      },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(options.timeout * 1000 + 5000),
    });
  } catch (fetchError) {
    // Detect connection refused / network errors
    const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    if (
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('fetch failed') ||
      err.cause?.toString().includes('ECONNREFUSED')
    ) {
      throw new SandboxRouterConnectionError(routerUrl, err);
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(
      `Sandbox execution failed: ${response.status} ${response.statusText} - ${body}`
    );
  }

  const resultData = await response.json();
  validateSandboxExecutionResponse(resultData);

  return {
    stdout: resultData.stdout ?? '',
    stderr: resultData.stderr ?? '',
    return_code: resultData.exit_code ?? 0,
  };
}

/**
 * Helper function to sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute Python code in GKE Agent Sandbox.
 *
 * Implements complete K8s SandboxClaim lifecycle:
 * 1. Create SandboxClaim
 * 2. Wait for Ready condition
 * 3. Execute code via router
 * 4. Delete claim (cleanup)
 *
 * @param options - Code, timeout, and optional environment variables
 * @param deps - Optional dependency injection for testing
 * @returns Execution result with stdout, stderr, and return_code
 * @throws SandboxTimeoutError on execution timeout (AC#7)
 * @throws ClaimReadyTimeoutError on claim ready timeout
 * @throws ClaimCreationError on claim creation failure
 * @throws Error on network/sandbox failures
 */
export async function executeSandbox(
  options: SandboxOptions,
  deps?: SandboxClientDeps
): Promise<SandboxResult> {
  // Resolve dependencies with defaults
  const resolvedDeps: Required<SandboxClientDeps> = {
    getK8sApiEndpoint: deps?.getK8sApiEndpoint ?? defaultGetK8sApiEndpoint,
    getK8sAccessToken: deps?.getK8sAccessToken ?? defaultGetK8sAccessToken,
    fetch: deps?.fetch ?? globalThis.fetch,
  };

  let claimName: string | null = null;
  let claimCreated = false;

  try {
    // Generate unique claim name
    claimName = generateClaimName();

    // Create SandboxClaim
    await createSandboxClaim(claimName, resolvedDeps);
    claimCreated = true;

    // Wait for Ready condition
    await waitForClaimReady(claimName, resolvedDeps);

    // Execute code with correct headers
    const result = await executeInSandbox(claimName, options, resolvedDeps);

    return result;
  } catch (error) {
    // Detect AbortSignal timeout
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new SandboxTimeoutError(options.timeout);
    }
    throw error;
  } finally {
    // Only delete if we successfully created the claim
    if (claimCreated && claimName) {
      await deleteSandboxClaim(claimName, resolvedDeps);
    }
  }
}

// Export for testing
export const __testing = {
  generateClaimName,
  createSandboxClaim,
  getSandboxClaim,
  waitForClaimReady,
  deleteSandboxClaim,
  executeInSandbox,
  buildShellCommand,
  validateGkeClusterInfo,
  validateSandboxClaim,
  validateSandboxExecutionResponse,
  initializeK8sConnection,
  CLAIM_READY_TIMEOUT_MS,
  CLAIM_READY_POLL_INTERVAL_MS,
  SANDBOX_NAMESPACE,
  SANDBOX_PORT,
  SANDBOX_TEMPLATE,
  // Allow clearing cached endpoint and dispatcher for tests
  clearCache: () => {
    cachedK8sEndpoint = null;
    cachedK8sDispatcher = null;
  },
  // Expose cache state for testing
  getCacheState: () => ({
    endpoint: cachedK8sEndpoint,
    hasDispatcher: cachedK8sDispatcher !== null,
  }),
};
