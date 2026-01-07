# Tech-Spec: Fix GKE Sandbox Client - Implement K8s SandboxClaim Lifecycle

**Created:** 2026-01-04
**Validated:** 2026-01-04 (Bob - Scrum Master, Fresh Context Review)
**Status:** ✅ Ready for Development (All critical issues addressed)
**Parent Story:** 6-2-execute-code-tool.md
**Priority:** Critical (blocks execute_code functionality)

**Validation Score:** 100% (60/60 items passed after improvements)
**Changes Applied:**
- ✅ 7 Critical fixes (K8s API integration, auth, polling logic, request format, test mocking, env vars, state tracking)
- ✅ 6 Enhancements (tradeoffs, test explanation, service account permissions, task ordering, timeouts, integration test clarity)
- ✅ LLM optimizations (reduced verbosity, improved structure)

## Overview

### Problem Statement

The `execute_code` tool is registered and callable by Claude, but **all sandbox executions fail with 400 Bad Request**. Investigation revealed that the TypeScript sandbox client implementation is fundamentally incomplete - it attempts to execute code directly via the sandbox router without creating the required Kubernetes SandboxClaim resource first.

**Evidence:**
- Current implementation: [sandbox-client.ts:42-53](src/tools/code-execution/sandbox-client.ts#L42-L53)
- Missing: SandboxClaim lifecycle (create → wait → execute → delete)
- Missing: Required HTTP headers (`X-Sandbox-ID`, `X-Sandbox-Namespace`, `X-Sandbox-Port`)
- Wrong request format: `{"code": "..."}` instead of `{"command": "python3 -c '...'"}`
- Tests passing with mocks, hiding the broken implementation

**Root Cause Timeline:**
1. Story 6.2 (Jan 2, 2026): Implemented sandbox client with direct router calls
2. Tests written with mocked fetch - validated **interface**, not **behavior**
3. Story 6.2 marked "done" with 33 tests passing ✅
4. Deployed to Cloud Run
5. **Production fails:** Real sandbox router returns 400 "X-Sandbox-ID header is required"
6. Story 6.2.1 (Jan 3, 2026): Identified exact fix needed
7. Validation report said "looks duplicate" - cancelled Story 6.2.1
8. Fix never implemented, production deployments continue to fail

**Why Tests Didn't Catch This:**
```typescript
// sandbox-client.test.ts (EXISTING - Story 6.2)
const mockFetch = vi.fn().mockResolvedValue({
  ok: true, // ❌ This always returns success regardless of headers
  json: async () => ({ stdout: '4\n', stderr: '', exit_code: 0 })
});
```

**What Was Missing:**
- Tests never called a REAL sandbox router (even in test environment)
- Tests never validated headers sent to router
- Tests never created real K8s SandboxClaims
- Mock validated request format, but not actual router protocol

**This Fix Addresses:** Add integration test with real K8s API calls (Task 7)

**Current Behavior:**
```
execute_code.start → codeLength:1247, timeout:30
HTTP POST → sandbox-router-svc:8080/execute
Response: 400 {"detail":"X-Sandbox-ID header is required"}
execute_code.error → "Sandbox execution failed: 400 Bad Request"
```

**Expected Behavior:**
```
1. Create SandboxClaim via K8s API
2. Wait for claim Ready condition
3. Execute code with proper headers
4. Return result
5. Delete SandboxClaim (cleanup)
```

### Solution

Rewrite `sandbox-client.ts` to implement the complete Kubernetes Agent Sandbox API lifecycle using direct K8s REST API calls with GCP service account authentication.

**Key Changes:**
- Add K8s SandboxClaim creation/deletion
- Add claim readiness polling (watch or poll)
- Add required HTTP headers for router execution
- Fix request body format (`command` instead of `code`)
- Add try/finally cleanup guarantee
- Maintain ToolResult error handling pattern

### Scope

**In Scope:**
- ✅ Rewrite `executeSandbox()` with K8s lifecycle
- ✅ Add K8s cluster config to environment
- ✅ Implement GCP service account auth for K8s API
- ✅ Add new types for SandboxClaim resources
- ✅ Update tests to validate headers and lifecycle
- ✅ Graceful error handling (claim creation, execution, cleanup)
- ✅ Unique claim names (concurrent-safe)
- ✅ Proper timeout handling (K8s API + sandbox execution)

**Out of Scope:**
- ❌ Claim pooling/reuse (future optimization)
- ❌ Kubernetes watch API (use polling for simplicity)
- ❌ Multi-cluster support (single cluster only)
- ❌ Custom resource validation webhooks

---

## Context for Development

### Codebase Patterns (MANDATORY)

**1. ESM Imports:**
```typescript
// ✅ CORRECT
import { handler } from './handler.js'

// ❌ WRONG
import { handler } from './handler'
```

**2. Tool Handler Pattern:**
```typescript
async function myTool(input: Input): Promise<ToolResult<Output>> {
  try {
    // ALL code here
    const data = await externalApi.call(input);
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: false
      }
    };
  }
}
```

**3. Logging:**
Include `traceId` in every log entry (not available in sandbox-client.ts, but use logger for debugging).

**4. Timeout Pattern:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

### Files to Reference

**Implementation References:**
- `_bmad-output/implementation-artifacts/stories/_archived/6-2-fix-sandbox-client.md` - Original fix spec with API examples
- `_bmad-output/architecture.md` lines 316-416 - GKE Agent Sandbox ADR
- `infra/gke-sandbox/README.md` - Cluster details and operational guide
- `src/tools/code-execution/tool.ts` - Handler that calls sandbox-client (no changes needed)
- `src/config/environment.ts` - Config pattern for new env vars

**Existing Code to Modify:**
- `src/tools/code-execution/sandbox-client.ts` (81 lines) - Complete rewrite
- `src/tools/code-execution/types.ts` (38 lines) - Add K8s types
- `src/tools/code-execution/sandbox-client.test.ts` (5458 bytes) - Update tests
- `src/config/environment.ts` - Add K8s cluster URL

**Package Already Available:**
- `google-auth-library@10.5.0` - For GCP service account → K8s bearer token

### Technical Decisions

**1. K8s API Access Method: Direct REST API (Option A)**

**Why:**
- ✅ No new dependencies (fetch + google-auth-library already available)
- ✅ Works from Cloud Run (external to cluster)
- ✅ GCP service account has `roles/editor` (includes K8s API access)
- ✅ Simple bearer token auth via `GoogleAuth.getAccessToken()`

**Rejected alternatives:**
- ❌ kubectl subprocess: Requires kubectl installed, subprocess overhead
- ❌ @kubernetes/client-node: Heavy dependency, overkill for 2 API calls
- ❌ Persistent claim: Not concurrent-safe, single point of failure

**2. SandboxClaim Lifecycle: Dynamic Per-Execution**

**Trade-off Analysis:**

| Approach | Pros | Cons | Selected? |
|----------|------|------|-----------|
| **Dynamic (per-execution)** | ✅ Concurrent-safe<br>✅ Clean isolation<br>✅ No state management<br>✅ Auto-cleanup | ❌ ~1-2s overhead per call<br>❌ Higher K8s API load | ✅ **YES** (MVP) |
| **Persistent (long-lived)** | ✅ Sub-second execution<br>✅ Simple implementation | ❌ Not concurrent-safe<br>❌ Single point of failure<br>❌ Requires health monitoring | ❌ No |
| **Pool (claim reuse)** | ✅ Fast warm execution<br>✅ Concurrent-safe<br>✅ Resource efficient | ❌ Complex state management<br>❌ Cleanup logic<br>❌ Claim expiry handling | ⏸️ Deferred (future optimization) |

**Decision:** Start with dynamic claims for correctness and simplicity. The warm pool (2 pre-provisioned sandboxes) reduces claim → ready time to <2s, making the overhead acceptable for MVP. Claim pooling can be added in Epic 7 if performance becomes a bottleneck.

**3. Claim Readiness: Polling (not Watch)**

**Why:**
- ✅ Simpler implementation (GET requests vs WebSocket)
- ✅ Sufficient for our use case (1-3s typical ready time)
- ✅ More reliable (no connection management)

**Pattern:** Poll every 500ms, timeout after 10s

**Implementation Constants:**
```typescript
// src/tools/code-execution/sandbox-client.ts
const CLAIM_READY_TIMEOUT_MS = 10_000; // 10 seconds
const CLAIM_READY_POLL_INTERVAL_MS = 500; // 500ms
```

**Rationale:** Warm pool should return ready claims in <2s. 10s timeout allows for:
- Cold start scenarios (pool exhausted)
- Network latency
- K8s API delays

**4. Claim Naming: Timestamp-based**

```typescript
const claimName = `orion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
```

**Why:**
- ✅ Unique across concurrent executions
- ✅ Sortable (helpful for debugging)
- ✅ No K8s name length issues (max 253 chars)

---

## K8s API Integration Details

### Getting the Cluster API Endpoint

**GKE API Endpoint Construction:**
```typescript
import { GoogleAuth } from 'google-auth-library';
import { config } from '../../config/environment.js';

async function getK8sApiEndpoint(): Promise<string> {
  const { gcpProjectId, gkeClusterName, gkeClusterRegion } = config;

  const gkeApiUrl = `https://container.googleapis.com/v1/projects/${gcpProjectId}/locations/${gkeClusterRegion}/clusters/${gkeClusterName}`;

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const token = await auth.getAccessToken();

  const response = await fetch(gkeApiUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get GKE cluster info: ${response.status}`);
  }

  const cluster = await response.json();
  return `https://${cluster.endpoint}`; // e.g., "https://34.172.X.X"
}
```

### GCP Authentication from Cloud Run

**Application Default Credentials (ADC):**

Cloud Run automatically provides credentials via ADC. The `GoogleAuth` class will automatically detect and use the service account attached to the Cloud Run service.

**No explicit configuration needed** - `new GoogleAuth()` will:
1. Detect Cloud Run environment
2. Use the attached service account (`{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`)
3. Generate short-lived OAuth 2.0 tokens

**Service Account Permissions Required:**

| Permission | Purpose | How to Verify |
|------------|---------|---------------|
| `roles/container.developer` | GKE API access (get cluster info) | `gcloud projects get-iam-policy ai-workflows-459123` |
| `roles/container.clusterViewer` | K8s API access (SandboxClaims) | Check IAM bindings for service account |

**Verification:**
```bash
# Check current roles
gcloud projects get-iam-policy ai-workflows-459123 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$(gcloud iam service-accounts list --format='value(email)' --filter='displayName:Compute Engine default service account')"

# Add if missing
gcloud projects add-iam-policy-binding ai-workflows-459123 \
  --member="serviceAccount:{PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/container.developer"
```

**Troubleshooting:**
- `403 Forbidden` from GKE API → Missing `roles/container.developer`
- `403 Forbidden` from K8s API → Missing `roles/container.clusterViewer`
- `401 Unauthorized` → ADC not working, check Cloud Run service account attachment

---

## Implementation Plan

### Tasks

- [ ] **Task 1: Add K8s cluster config to environment** (~10 min)
  - Add `gcpProjectId`, `gkeClusterName`, `gkeClusterRegion` to `config/environment.ts`
  - Defaults: `orion-sandbox-cluster`, `us-central1`, `ai-workflows-459123`
  - Add to `.env.example` with documentation
  - **Code change required:**
    ```typescript
    // src/config/environment.ts
    export const config = {
      // ... existing config ...

      // GKE Cluster Configuration (Tech-Spec: Fix Sandbox Client)
      gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ai-workflows-459123',
      gkeClusterName: process.env.GKE_CLUSTER_NAME ?? 'orion-sandbox-cluster',
      gkeClusterRegion: process.env.GKE_CLUSTER_REGION ?? 'us-central1',
    } as const;
    ```

- [ ] **Task 2: Add K8s resource types** (~10 min)
  - Add `SandboxClaim`, `SandboxClaimStatus` interfaces to `types.ts`
  - Add K8s API response types (`K8sResource`, `K8sStatus`)
  - Follow K8s API conventions

- [ ] **Task 3: Implement K8s API helper functions** (~45 min)

  **Implement in this order (dependencies flow downward):**

  **3a. `getK8sAccessToken()`** (~10 min)
  - Input: None (uses ADC)
  - Output: `Promise<string>` - OAuth 2.0 bearer token
  - Deps: google-auth-library
  - Error: Throw if ADC fails
  - Implementation: See "GCP Authentication from Cloud Run" section above

  **3b. `getK8sApiEndpoint()`** (~15 min)
  - Input: None (uses config)
  - Output: `Promise<string>` - `https://{cluster-ip}`
  - Deps: 3a (needs token)
  - Error: Throw if GKE API call fails
  - Implementation: See "Getting the Cluster API Endpoint" section above

  **3c. `createSandboxClaim(claimName: string)`** (~10 min)
  - Input: Claim name (e.g., `orion-exec-1234567890-a3f2x`)
  - Output: `Promise<void>`
  - Deps: 3a, 3b
  - Error: Throw if K8s API returns non-201
  - See "SandboxClaim Resource Spec" section for request body

  **3d. `waitForClaimReady(claimName: string)`** (~15 min)
  - Input: Claim name
  - Output: `Promise<void>` when ready
  - Deps: 3a, 3b
  - Error: Throw `ClaimReadyTimeoutError` after 10s, or throw if claim fails
  - See "SandboxClaim Status Polling" section for logic
  - Uses `CLAIM_READY_TIMEOUT_MS` and `CLAIM_READY_POLL_INTERVAL_MS` constants

  **3e. `deleteSandboxClaim(claimName: string)`** (~5 min)
  - Input: Claim name
  - Output: `Promise<void>`
  - Deps: 3a, 3b
  - Error: Log warning but don't throw (non-fatal - K8s GC will clean up)

- [ ] **Task 4: Rewrite executeSandbox() with lifecycle** (~60 min)

  **Implementation with state tracking:**
  ```typescript
  async function executeSandbox(options: SandboxOptions): Promise<SandboxResult> {
    let claimName: string | null = null;
    let claimCreated = false; // STATE FLAG

    try {
      // Generate unique claim name
      claimName = `orion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Create SandboxClaim
      await createSandboxClaim(claimName);
      claimCreated = true; // Mark created ONLY after successful POST

      // Wait for Ready condition (poll every 500ms, 10s timeout)
      await waitForClaimReady(claimName);

      // Execute code with correct headers
      const result = await executeInSandbox(claimName, options);

      return result;
    } finally {
      // Only delete if we successfully created the claim
      if (claimCreated && claimName) {
        try {
          await deleteSandboxClaim(claimName);
        } catch (deleteErr) {
          // Non-fatal - K8s garbage collection will clean up eventually
          logger.warn({ claimName, err: deleteErr }, 'Failed to delete SandboxClaim');
        }
      }
    }
  }
  ```

  **Required headers for router execution:**
  - `Content-Type: application/json`
  - `X-Sandbox-ID: {claimName}`
  - `X-Sandbox-Namespace: default`
  - `X-Sandbox-Port: 8888`

  **Critical: Request format** (see "Router Request Format" section below)
  - Must send `{"command": "python3 -c '...'"}`
  - NOT `{"code": "..."}`

  **State tracking prevents:**
  - Attempting to delete non-existent claims (404 errors)
  - Claim leaks when creation fails partway through

- [ ] **Task 5: Update error handling** (~20 min)
  - Add specific error types: `ClaimCreationError`, `ClaimReadyTimeoutError`
  - Map K8s API errors to user-friendly messages
  - Preserve original ToolResult pattern in tool.ts handler
  - Log K8s API responses for debugging

- [ ] **Task 6: Update tests** (~60 min)

  **Test Mocking Pattern - Dependency Injection:**

  Update `executeSandbox()` signature to accept optional dependencies:
  ```typescript
  export async function executeSandbox(
    options: SandboxOptions,
    // Dependency injection for testing
    deps?: {
      getK8sApiEndpoint?: () => Promise<string>;
      getK8sAccessToken?: () => Promise<string>;
      fetch?: typeof fetch;
    }
  ): Promise<SandboxResult> {
    const {
      getK8sApiEndpoint: getEndpoint = defaultGetK8sApiEndpoint,
      getK8sAccessToken: getToken = defaultGetK8sAccessToken,
      fetch: fetchFn = fetch,
    } = deps ?? {};

    // Use injected dependencies
    const endpoint = await getEndpoint();
    const token = await getToken();
    // ...
  }
  ```

  **Test examples:**
  ```typescript
  // sandbox-client.test.ts
  test('creates SandboxClaim with correct spec', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: { conditions: [{ type: 'Ready', status: 'True' }] } })
    });

    await executeSandbox(
      { code: 'print(2+2)', timeout: 30 },
      {
        getK8sApiEndpoint: async () => 'https://mock-cluster',
        getK8sAccessToken: async () => 'mock-token',
        fetch: mockFetch,
      }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sandboxclaims'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token' },
      })
    );
  });

  test('validates headers sent to router', async () => {
    const mockFetch = vi.fn();
    // ... mock K8s API responses ...
    mockFetch.mockResolvedValueOnce({ /* router response */ });

    await executeSandbox({ code: 'print(1)', timeout: 30 }, { fetch: mockFetch });

    // Verify router request has correct headers
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/execute'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Sandbox-ID': expect.stringMatching(/^orion-exec-/),
          'X-Sandbox-Namespace': 'default',
          'X-Sandbox-Port': '8888',
        }),
      })
    );
  });
  ```

  **Test coverage:**
  - Mock K8s API calls (create, get, delete)
  - Mock sandbox router execution
  - Validate correct headers in router request
  - Validate claim creation request body
  - Test error paths: claim creation fails, ready timeout, execution fails, cleanup fails
  - Test concurrent executions (unique claim names)
  - Verify claim cleanup only happens when created

- [ ] **Task 7: Integration test** (~30 min)

  **Prerequisites:**
  1. GKE cluster must be deployed (`infra/gke-sandbox/`)
  2. `kubectl` configured with cluster credentials
  3. Port-forward running: `kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default`

  **Test Implementation:**
  ```typescript
  // tests/integration/sandbox-client.integration.test.ts
  import { executeSandbox } from '../../src/tools/code-execution/sandbox-client.js';

  test.skip('real K8s SandboxClaim lifecycle', async () => {
    // This test requires:
    // 1. GKE cluster deployed
    // 2. kubectl port-forward running
    // 3. GCP credentials with K8s API access

    const result = await executeSandbox({
      code: 'print(2+2)',
      timeout: 30,
    });

    expect(result.stdout).toBe('4\n');
    expect(result.return_code).toBe(0);

    // Verify claim was deleted (check K8s)
    const claims = await listSandboxClaims();
    expect(claims).toHaveLength(0);
  }, 60000); // 60s timeout for integration test
  ```

  **Run manually:**
  ```bash
  # Start port-forward in separate terminal
  kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default

  # Run integration test
  pnpm test:integration sandbox-client.integration.test.ts

  # Verify no orphaned claims
  kubectl get sandboxclaims -n default
  ```

  **Success Criteria:**
  - ✅ Test passes
  - ✅ No orphaned SandboxClaims remain
  - ✅ Logs show claim creation → ready → execution → deletion

  **Document in PR:** Results of integration test run

- [ ] **Task 8: Update documentation** (~15 min)
  - Update Story 6.2 status from "review" to "done"
  - Add completion note to Story 6.2.1 (archived)
  - Update `infra/gke-sandbox/README.md` with auth setup
  - Update `.env.example` with K8s config vars

**Estimated Total:** ~4 hours

### Acceptance Criteria

**AC#1: SandboxClaim Lifecycle Management**
- **Given** an `execute_code` call
- **When** the sandbox client processes it
- **Then** it must:
  1. Create a unique SandboxClaim via K8s API
  2. Poll for Ready condition (timeout 10s)
  3. Execute code with proper headers
  4. Delete the claim in finally block (guaranteed cleanup)

**AC#2: Correct HTTP Headers**
- **Given** a request to sandbox router
- **When** sending execute request
- **Then** include headers:
  - `Content-Type: application/json`
  - `X-Sandbox-ID: {claimName}`
  - `X-Sandbox-Namespace: default`
  - `X-Sandbox-Port: 8888`

**AC#3: Correct Request Format**
- **Given** Python code to execute
- **When** sending to router
- **Then** body must be:
  ```json
  {"command": "python3 -c 'print(2+2)'"}
  ```
  (NOT `{"code": "print(2+2)"}`)

---

## Router Request Format (CRITICAL)

**Current implementation is WRONG:**
```typescript
// ❌ INCORRECT (current sandbox-client.ts:46)
body: JSON.stringify({
  code: options.code,
  timeout_seconds: options.timeout,
  environment: options.env,
  template: 'python-runtime-template',
})
```

**Correct format (verified from Python SDK and manual testing):**
```typescript
// ✅ CORRECT
body: JSON.stringify({
  command: `python3 -c '${escapedCode}'`, // Must wrap in python3 -c
})
```

**Why:** The sandbox router expects a **shell command**, not raw Python code. The router executes `command` inside the container, so we must wrap our code:
- Input: `print(2+2)`
- Router receives: `{"command": "python3 -c 'print(2+2)'"}`
- Container executes: `python3 -c 'print(2+2)'`
- Output: `{"stdout": "4\n", "stderr": "", "exit_code": 0}`

**Code Escaping:** Use `JSON.stringify()` for the outer JSON, which will properly escape single quotes in the Python code. For complex code with both single and double quotes, consider using Python's triple-quoted strings or additional escaping.

**Headers Required:**
```typescript
headers: {
  'Content-Type': 'application/json',
  'X-Sandbox-ID': claimName,
  'X-Sandbox-Namespace': 'default',
  'X-Sandbox-Port': '8888',
}
```

---

**AC#4: Concurrent Execution Safety**
- **Given** two simultaneous `execute_code` calls
- **When** both execute concurrently
- **Then** each gets isolated SandboxClaim (unique names)
- **And** both succeed without conflict

**AC#5: Graceful Error Handling**
- **Given** K8s API or sandbox failures
- **When** errors occur
- **Then** return ToolResult with error (never throw from handler)
- **And** cleanup claim if created (even on error)

**AC#6: Authentication Success**
- **Given** Cloud Run deployment with service account
- **When** obtaining K8s access token
- **Then** token is valid for cluster API access
- **And** no hardcoded credentials required

**AC#7: Timeout Behavior**
- **Given** claim creation takes >10s
- **When** ready timeout expires
- **Then** delete partially-created claim
- **And** return timeout error to user

**AC#8: Existing Tests Pass**
- **Given** existing 33 unit tests in sandbox-client.test.ts
- **When** running test suite
- **Then** all tests pass with updated mocks
- **And** new tests validate headers/lifecycle

---

## Additional Context

### Dependencies

**Already Available:**
- `google-auth-library@10.5.0` - GCP auth
- `node-fetch` (built-in) - HTTP client

**No New Dependencies Required** ✅

### Environment Variables

**Add to `.env` and `.env.example`:**
```bash
# GKE Cluster Configuration (for K8s API access)
GCP_PROJECT_ID=ai-workflows-459123
GKE_CLUSTER_NAME=orion-sandbox-cluster
GKE_CLUSTER_REGION=us-central1
```

**Add to `src/config/environment.ts`:**
```typescript
export const config = {
  // ... existing config ...

  // GKE Cluster Configuration (Tech-Spec: Fix Sandbox Client)
  gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ai-workflows-459123',
  gkeClusterName: process.env.GKE_CLUSTER_NAME ?? 'orion-sandbox-cluster',
  gkeClusterRegion: process.env.GKE_CLUSTER_REGION ?? 'us-central1',

  // GKE Agent Sandbox (Story 6.2) - already exists
  gkeSandboxRouterUrl:
    process.env.GKE_SANDBOX_ROUTER_URL ??
    'http://sandbox-router-svc.default.svc.cluster.local:8080',
} as const;
```

**Existing (already configured in Story 6.2):**
```bash
GKE_SANDBOX_ROUTER_URL=http://localhost:8080  # local dev (port-forward)
# Production uses: http://sandbox-router-svc.default.svc.cluster.local:8080
```

### K8s API Endpoints

**SandboxClaim Operations:**
```
Base: https://container.googleapis.com/v1/projects/{project}/locations/{region}/clusters/{cluster}
API: {clusterEndpoint}/apis/extensions.agents.x-k8s.io/v1alpha1

Create: POST   {API}/namespaces/default/sandboxclaims
Get:    GET    {API}/namespaces/default/sandboxclaims/{name}
Delete: DELETE {API}/namespaces/default/sandboxclaims/{name}
```

**Authentication:**
```typescript
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const token = await auth.getAccessToken();
// Use in header: Authorization: Bearer {token}
```

### SandboxClaim Resource Spec

**Create Request:**
```json
{
  "apiVersion": "extensions.agents.x-k8s.io/v1alpha1",
  "kind": "SandboxClaim",
  "metadata": {
    "name": "orion-exec-1735977600000-a3f2x",
    "namespace": "default"
  },
  "spec": {
    "sandboxTemplateRef": {
      "name": "python-runtime-template"
    }
  }
}
```

### SandboxClaim Status Polling

**Status Progression:**

**NOT READY (Creating):**
```json
{
  "status": {
    "conditions": [
      {
        "type": "Ready",
        "status": "False",
        "reason": "Creating",
        "message": "Sandbox pod is being provisioned"
      }
    ]
  }
}
```

**READY (Success):**
```json
{
  "status": {
    "conditions": [
      {
        "type": "Ready",
        "status": "True",
        "lastTransitionTime": "2026-01-04T..."
      }
    ]
  }
}
```

**FAILED:**
```json
{
  "status": {
    "conditions": [
      {
        "type": "Ready",
        "status": "False",
        "reason": "Failed",
        "message": "Pod failed to start: ImagePullBackOff"
      }
    ]
  }
}
```

**Polling Logic Implementation:**
```typescript
async function waitForClaimReady(claimName: string, timeoutMs: number = CLAIM_READY_TIMEOUT_MS): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const claim = await getSandboxClaim(claimName);
    const readyCondition = claim.status?.conditions?.find(c => c.type === 'Ready');

    if (readyCondition?.status === 'True') {
      return; // SUCCESS
    }

    if (readyCondition?.status === 'False' && readyCondition.reason === 'Failed') {
      throw new Error(`Claim failed: ${readyCondition.message}`);
    }

    // Still creating, keep polling
    await sleep(CLAIM_READY_POLL_INTERVAL_MS);
  }

  throw new ClaimReadyTimeoutError(timeoutMs / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Testing Strategy

**Unit Tests (Vitest):**
- Mock all external calls (K8s API, sandbox router)
- Validate request formats and headers
- Test error paths and cleanup
- Test concurrent claim name uniqueness

**Integration Test:** See Task 7 for detailed setup and procedure.

**E2E Test (Slack):**
```
@orion can u fetch demographic data for NFL vs College Football and analyze it with code execution?
```
Expected: Claude uses execute_code, returns demographic analysis.

### Notes

**Performance Expectations:**
- Claim creation: ~500ms (K8s API call)
- Ready wait: ~1-2s (warm pool active)
- Execution: <30s (configurable timeout)
- Cleanup: ~500ms (async, non-blocking)
- **Total overhead:** ~2-3s per execution

**Warm Pool Active:**
According to `kubectl get sandboxwarmpools`, the warm pool has 2 ready sandboxes pre-provisioned. This means claim → ready transition is <2s typically.

**Error Scenarios Handled:**
1. K8s API authentication failure → Log + return error
2. Claim creation fails (quota, permissions) → Return error
3. Claim ready timeout (>10s) → Delete claim + return timeout error
4. Sandbox execution fails → Return error + cleanup claim
5. Cleanup fails → Log warning (non-fatal, K8s GC will clean up)

**Debugging Tips:**
```bash
# Watch claim lifecycle
kubectl get sandboxclaims -n default -w

# Check claim details
kubectl describe sandboxclaim orion-exec-{timestamp} -n default

# View sandbox router logs
kubectl logs -l app=sandbox-router -n default --tail=100

# Check warm pool status
kubectl describe sandboxwarmpool orion-sandbox-warmpool -n default
```

**Future Optimizations (Out of Scope):**
- Claim pooling: Reuse warm claims for 60s before cleanup
- Watch API: Use K8s watch instead of polling for readiness
- Parallel execution: Multiple sandboxes per claim (if supported)
- Metrics: Track claim creation time, execution time, failure rates

---

## Reference: Verified Working Request

From archived Story 6.2.1, this pattern was manually verified to work:

```bash
# 1. Create claim
kubectl apply -f - <<EOF
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: test-claim-123
  namespace: default
spec:
  sandboxTemplateRef:
    name: python-runtime-template
EOF

# 2. Wait for ready
kubectl wait --for=condition=Ready sandboxclaim/test-claim-123 --timeout=30s

# 3. Execute with proper headers
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -H "X-Sandbox-ID: test-claim-123" \
  -H "X-Sandbox-Namespace: default" \
  -H "X-Sandbox-Port: 8888" \
  -d '{"command": "python3 -c \"print(2+2)\""}'

# Response: {"stdout":"4\n","stderr":"","exit_code":0}

# 4. Cleanup
kubectl delete sandboxclaim test-claim-123
```

**This is the exact pattern to implement in TypeScript.**

---

## Success Checklist

Before marking this complete:

- [ ] Code compiles without errors
- [ ] All 33+ tests pass (existing + new)
- [ ] Integration test succeeds (manual port-forward test)
- [ ] E2E test succeeds (Slack bot responds with code execution)
- [ ] SandboxClaims are cleaned up (no orphaned resources)
- [ ] Error messages are user-friendly
- [ ] Story 6.2 updated to "done" status
- [ ] PR description includes before/after behavior

---

## Files Changed Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `src/tools/code-execution/sandbox-client.ts` | ~200 | Major rewrite |
| `src/tools/code-execution/types.ts` | +40 | New types |
| `src/tools/code-execution/sandbox-client.test.ts` | ~150 | Test updates |
| `src/config/environment.ts` | +10 | New config |
| `.env.example` | +5 | Documentation |

**Total:** ~405 lines changed across 5 files
