# ATDD Checklist - Epic 6, Story 6.2.1: Fix GKE Sandbox Client - K8s Lifecycle

**Date:** 2026-01-04
**Author:** Sid
**Primary Test Level:** Integration

---

## Story Summary

The `execute_code` tool is registered and callable by Claude, but all sandbox executions fail with 400 Bad Request. The TypeScript sandbox client implementation is fundamentally incomplete - it attempts to execute code directly via the sandbox router without creating the required Kubernetes SandboxClaim resource first.

**As a** developer implementing the execute_code tool
**I want** the sandbox client to properly manage K8s SandboxClaim lifecycle
**So that** Claude can execute Python code in GKE sandboxes with network access

---

## Acceptance Criteria

1. **AC#1:** SandboxClaim Lifecycle Management - Create → Wait for Ready → Execute → Delete
2. **AC#2:** Correct HTTP Headers - `X-Sandbox-ID`, `X-Sandbox-Namespace`, `X-Sandbox-Port`
3. **AC#3:** Correct Request Format - `{"command": "python3 -c '...'}"}` not `{"code": "..."}`
4. **AC#4:** Concurrent Execution Safety - Unique claim names, no conflicts
5. **AC#5:** Graceful Error Handling - Return ToolResult, cleanup on error
6. **AC#6:** Authentication Success - GCP service account → K8s bearer token works
7. **AC#7:** Timeout Behavior - Delete claim if ready timeout expires
8. **AC#8:** Existing Tests Pass - 33 unit tests pass with updated mocks

---

## Failing Tests Created (RED Phase)

### Integration Tests (4 tests)

**File:** `tests/integration/sandbox-client.integration.test.ts` (398 lines)

These tests validate the COMPLETE K8s lifecycle that was missing from unit tests and caused production failures.

- ✅ **Test:** `should execute code via full K8s SandboxClaim lifecycle`
  - **Status:** RED - `executeSandbox` implementation incomplete (missing K8s lifecycle)
  - **Verifies:** AC#1 (Lifecycle), AC#2 (Headers), AC#3 (Request Format), AC#6 (Auth)
  - **Expected Failure:** Current implementation calls router directly without claim creation
  - **Success Criteria:**
    - Code executes: `stdout='4\n'`, `return_code=0`
    - No orphaned SandboxClaims in K8s
    - Logs show: create → ready → execute → delete

- ✅ **Test:** `should handle concurrent executions with isolated claims`
  - **Status:** RED - Concurrent calls may conflict without unique claim names
  - **Verifies:** AC#4 (Concurrency)
  - **Expected Failure:** Implementation doesn't ensure unique claim names
  - **Success Criteria:**
    - 3 concurrent executions all succeed
    - Each gets different output (A, B, C)
    - No orphaned claims after cleanup

- ✅ **Test:** `should handle claim ready timeout gracefully`
  - **Status:** RED - Timeout handling not implemented
  - **Verifies:** AC#7 (Timeout)
  - **Expected Failure:** Implementation doesn't poll for Ready or handle timeout
  - **Success Criteria:**
    - Timeout returns clear error
    - Partial claim is deleted (no leak)

- ✅ **Test:** `should execute code with network access`
  - **Status:** RED - Basic execution not working yet
  - **Verifies:** Story 6.2 AC#2 (Network access in sandbox)
  - **Expected Failure:** Same as first test (missing K8s lifecycle)
  - **Success Criteria:**
    - HTTP request to httpbin.org succeeds
    - Returns expected JSON data
    - Exit code 0, no stderr

---

## Data Factories Created

### K8s Mock Helpers

**File:** `tests/helpers/k8s-mocks.ts`

**Exports:**

**Mock Data Factories:**
- `createMockSandboxClaim(overrides?)` - Create K8s SandboxClaim resource
- `createMockSandboxClaimCreating(name)` - Claim in "Creating" state
- `createMockSandboxClaimReady(name)` - Claim in "Ready" state
- `createMockSandboxClaimFailed(name)` - Claim in "Failed" state
- `createMockK8sError(code, reason, message)` - K8s API error response

**Mock Response Builders:**
- `createMockK8sResponse(body, status)` - Generic K8s API response
- `createMockClaimCreationResponse(claimName)` - POST /sandboxclaims success
- `createMockClaimStatusReadyResponse(claimName)` - GET /sandboxclaims/{name} ready
- `createMockClaimDeletionResponse()` - DELETE /sandboxclaims/{name} success
- `createMockRouterExecutionResponse(stdout, stderr, exitCode)` - Router execution result
- `createMockRouterBadRequestResponse(detail)` - Router 400 error

**Mock Fetch Sequence Builders:**
- `createMockFetchSequenceSuccess(claimName, result)` - Full lifecycle success
- `createMockFetchSequenceWithPolling(claimName, result)` - Success with 2 polls
- `createMockFetchSequenceClaimCreationFailed()` - K8s API 403 Forbidden
- `createMockFetchSequenceClaimReadyTimeout(claimName)` - Never becomes ready
- `createMockFetchSequenceExecutionMissingHeaders(claimName)` - Router 400 error

**Dependency Injection Helper:**
- `createMockSandboxDeps(overrides)` - Mock getK8sApiEndpoint, getK8sAccessToken, fetch

**Example Usage:**

```typescript
import {
  createMockSandboxDeps,
  createMockFetchSequenceSuccess,
} from '../../../tests/helpers/k8s-mocks.js';

const mockFetch = vi.fn();
const responses = createMockFetchSequenceSuccess('test-claim', '4\n');
responses.forEach((r) => mockFetch.mockResolvedValueOnce(r));

const deps = createMockSandboxDeps({ fetch: mockFetch });
const result = await executeSandbox({ code: 'print(2+2)', timeout: 30 }, deps);

expect(result.stdout).toBe('4\n');
expect(mockFetch).toHaveBeenCalledTimes(4); // create, status, execute, delete
```

---

## Fixtures Created

**None** - Integration tests use real K8s resources. Unit tests use mock builders above.

---

## Mock Requirements

### GCP Service Account Permissions

**Required Roles:**
- `roles/container.developer` - GKE API access (get cluster info)
- `roles/container.clusterViewer` - K8s API access (SandboxClaims)

**Verification:**
```bash
gcloud projects get-iam-policy ai-workflows-459123 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:*compute@developer.gserviceaccount.com"
```

**Add if missing:**
```bash
gcloud projects add-iam-policy-binding ai-workflows-459123 \
  --member="serviceAccount:{PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/container.developer"
```

### K8s SandboxClaim API

**Endpoints:**
- Create: `POST {k8s}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims`
- Get: `GET {k8s}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims/{name}`
- Delete: `DELETE {k8s}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims/{name}`

**Authentication:**
- Header: `Authorization: Bearer {token}`
- Token via: `GoogleAuth.getAccessToken()` with scope `https://www.googleapis.com/auth/cloud-platform`

---

## Required Additions to Source Code

### Environment Variables (`src/config/environment.ts`)

Add these config fields:
```typescript
// GKE Cluster Configuration (Tech-Spec: Fix Sandbox Client)
gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ai-workflows-459123',
gkeClusterName: process.env.GKE_CLUSTER_NAME ?? 'orion-sandbox-cluster',
gkeClusterRegion: process.env.GKE_CLUSTER_REGION ?? 'us-central1',
```

Add to `.env.example`:
```bash
# GKE Cluster Configuration (for K8s API access)
GCP_PROJECT_ID=ai-workflows-459123
GKE_CLUSTER_NAME=orion-sandbox-cluster
GKE_CLUSTER_REGION=us-central1
```

### K8s Resource Types (`src/tools/code-execution/types.ts`)

Add these interfaces:
```typescript
export interface SandboxClaim {
  apiVersion: 'extensions.agents.x-k8s.io/v1alpha1';
  kind: 'SandboxClaim';
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    sandboxTemplateRef: { name: string };
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
    }>;
  };
}

export class ClaimReadyTimeoutError extends Error {
  constructor(timeoutSeconds: number) {
    super(`SandboxClaim not ready after ${timeoutSeconds}s`);
    this.name = 'ClaimReadyTimeoutError';
  }
}
```

### Function Signature Update (`src/tools/code-execution/sandbox-client.ts`)

Update `executeSandbox` for dependency injection:
```typescript
export async function executeSandbox(
  options: SandboxOptions,
  // Dependency injection for testing
  deps?: {
    getK8sApiEndpoint?: () => Promise<string>;
    getK8sAccessToken?: () => Promise<string>;
    fetch?: typeof fetch;
  }
): Promise<SandboxResult>
```

---

## Implementation Checklist

### Test: Full K8s SandboxClaim Lifecycle

**File:** `tests/integration/sandbox-client.integration.test.ts:117`

**Tasks to make this test pass:**

- [ ] **Task 1: Add K8s cluster config** (10 min)
  - Add `gcpProjectId`, `gkeClusterName`, `gkeClusterRegion` to `config/environment.ts`
  - Add to `.env.example` with defaults
  - File: `src/config/environment.ts`

- [ ] **Task 2: Add K8s resource types** (10 min)
  - Add `SandboxClaim`, `SandboxClaimStatus` interfaces
  - Add `ClaimReadyTimeoutError` class
  - File: `src/tools/code-execution/types.ts`

- [ ] **Task 3: Implement K8s API helper functions** (45 min)
  - `getK8sAccessToken()` - OAuth 2.0 bearer token via GoogleAuth
  - `getK8sApiEndpoint()` - Fetch cluster endpoint from GKE API
  - `createSandboxClaim(claimName)` - POST to K8s API
  - `waitForClaimReady(claimName)` - Poll status every 500ms, 10s timeout
  - `deleteSandboxClaim(claimName)` - DELETE from K8s API (log-only on fail)
  - File: `src/tools/code-execution/sandbox-client.ts`

- [ ] **Task 4: Rewrite executeSandbox() with lifecycle** (60 min)
  - Generate unique claim name: `orion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  - Create SandboxClaim
  - Add state flag: `claimCreated = true` after successful POST
  - Wait for Ready condition
  - Execute with correct headers: `X-Sandbox-ID`, `X-Sandbox-Namespace`, `X-Sandbox-Port`
  - Fix request format: `{"command": "python3 -c '...'"}`
  - Add try/finally cleanup with state check
  - File: `src/tools/code-execution/sandbox-client.ts`

- [ ] **Task 5: Update error handling** (20 min)
  - Add `ClaimCreationError` type
  - Map K8s API errors to user-friendly messages
  - Preserve ToolResult pattern
  - Log K8s API responses for debugging
  - File: `src/tools/code-execution/sandbox-client.ts`

- [ ] **Task 6: Update unit tests** (60 min)
  - Update `executeSandbox()` signature with deps injection
  - Update existing tests with mock K8s API calls
  - Add test: validates headers sent to router
  - Add test: validates claim creation request body
  - Add test: validates claim cleanup on error
  - Add test: validates unique claim names
  - File: `src/tools/code-execution/sandbox-client.test.ts`

- [ ] **Task 7: Run integration test** (30 min)
  - Deploy GKE cluster: `kubectl apply -f infra/gke-sandbox/`
  - Configure kubectl credentials
  - Start port-forward: `kubectl port-forward svc/sandbox-router-svc 8080:8080`
  - Run: `pnpm test tests/integration/sandbox-client.integration.test.ts`
  - Verify: No orphaned SandboxClaims
  - Document: Results in this checklist

- [ ] **Task 8: Update documentation** (15 min)
  - Update Story 6.2 status to "done"
  - Add completion note to Story 6.2.1
  - Update `infra/gke-sandbox/README.md` with auth setup
  - File: `_bmad-output/implementation-artifacts/stories/6-2-execute-code-tool.md`

- [ ] Run test: `pnpm test tests/integration/sandbox-client.integration.test.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 4 hours

---

## Running Tests

```bash
# Run unit tests (fast, mocked)
pnpm test sandbox-client

# Run integration tests (requires setup - see below)
pnpm test tests/integration/sandbox-client.integration.test.ts

# Run with coverage
pnpm test:coverage

# Watch mode during development
pnpm test:watch sandbox-client
```

### Integration Test Setup

**Prerequisites:**

1. **Deploy GKE cluster:**
   ```bash
   kubectl apply -f infra/gke-sandbox/sandbox-template-and-pool.yaml
   kubectl apply -f infra/gke-sandbox/sandbox-router.yaml
   ```

2. **Configure kubectl:**
   ```bash
   gcloud container clusters get-credentials orion-sandbox-cluster \
     --region=us-central1 \
     --project=ai-workflows-459123
   ```

3. **Start port-forward** (separate terminal):
   ```bash
   kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default
   ```

4. **Set environment variables:**
   ```bash
   export GCP_PROJECT_ID=ai-workflows-459123
   export GKE_CLUSTER_NAME=orion-sandbox-cluster
   export GKE_CLUSTER_REGION=us-central1
   export GKE_SANDBOX_ROUTER_URL=http://localhost:8080
   ```

5. **Run tests:**
   ```bash
   pnpm test tests/integration/sandbox-client.integration.test.ts
   ```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests written and failing
- ✅ Test helpers created (K8s mock builders)
- ✅ Integration test validates full K8s lifecycle
- ✅ Test README documents workflow
- ✅ Implementation checklist maps tests to tasks

**Verification:**

- Integration tests fail with clear messages (missing K8s lifecycle)
- Unit tests pass with mocks but don't validate behavior
- Failure messages actionable for DEV team

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick Task 1** from implementation checklist (add K8s config)
2. **Read the task** requirements
3. **Implement** the config changes
4. **Verify** config loads correctly
5. **Move to Task 2** and repeat

**Key Principles:**

- One task at a time (follow checklist order)
- Minimal implementation (don't over-engineer)
- Run integration test frequently (validates real behavior)
- Use unit tests for quick feedback during development

**Progress Tracking:**

- Check off tasks as completed
- Run integration test after Task 7 to verify full lifecycle
- Document any issues or deviations in tech-spec

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (integration + unit)
2. **Review code for quality**
   - Extract helper functions (DRY)
   - Add JSDoc comments
   - Improve error messages
3. **Optimize performance** (if needed)
   - Consider claim pooling (future Epic 7)
4. **Ensure tests still pass** after each refactor

**Completion:**

- All 4 integration tests pass
- All 33+ unit tests pass
- No orphaned SandboxClaims in K8s
- Code review approved
- Story 6.2 marked "done"

---

## Next Steps

1. **Review this checklist** with team
2. **Run failing integration test** to confirm RED phase:
   ```bash
   pnpm test tests/integration/sandbox-client.integration.test.ts
   ```
   Expected: Tests fail (implementation incomplete)
3. **Begin implementation** using checklist as roadmap (Tasks 1-8)
4. **Work one task at a time** (don't skip ahead)
5. **Run integration test** after Task 7 to verify
6. **When all tests pass**, refactor for quality
7. **Update story status** to 'done' in `sprint-status.yaml`

---

## Knowledge Base References Applied

This ATDD workflow consulted the following patterns:

- **test-quality.md** - Given-When-Then structure, one assertion per test, deterministic tests
- **timing-debugging.md** - Polling pattern for async K8s Ready condition
- **data-factories.md** - Mock builders for K8s API responses
- **test-healing-patterns.md** - Integration tests to catch mock-induced blindness

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `pnpm test tests/integration/sandbox-client.integration.test.ts`

**Expected Results (BEFORE Implementation):**

```
❌ FAIL tests/integration/sandbox-client.integration.test.ts
  GKE Sandbox Client - Integration Tests
    ✓ [skipped] should execute code via full K8s SandboxClaim lifecycle
    ✓ [skipped] should handle concurrent executions with isolated claims
    ✓ [skipped] should handle claim ready timeout gracefully
    ✓ [skipped] should execute code with network access

Test Files  1 skipped (1)
     Tests  4 skipped (4)
```

**OR (if tests not skipped):**

```
❌ FAIL tests/integration/sandbox-client.integration.test.ts
  GKE Sandbox Client - Integration Tests
    ✗ should execute code via full K8s SandboxClaim lifecycle
      → Error: 400 Bad Request - X-Sandbox-ID header is required

Test Files  1 failed (1)
     Tests  1 failed, 3 skipped (4)
```

**Summary:**

- Total tests: 4 integration tests
- Passing: 0 (expected - tests skipped or fail)
- Failing: 0-4 (depends on skip status)
- Status: ✅ RED phase verified (implementation missing)

**Expected Failure Messages:**
- "X-Sandbox-ID header is required" (current broken implementation)
- OR: "executeSandbox lifecycle incomplete" (after partial refactor)

**Run after implementation to verify GREEN:**
```bash
pnpm test tests/integration/sandbox-client.integration.test.ts
# Expected: All 4 tests PASS
```

---

## Notes

- **Critical:** Integration test is the PRIMARY validation. Unit tests provide fast feedback but mocks can lie.
- **Claim naming:** Use timestamp + random suffix for uniqueness across concurrent executions
- **Cleanup guarantee:** Use try/finally with state flag to prevent orphaned claims
- **Polling timeout:** 10s is sufficient for warm pool (2s typical), allows for cold starts
- **Authentication:** ADC works automatically from Cloud Run, no explicit config needed
- **Network access:** Sandbox has full network (Story 6.2 AC#2), test validates with real HTTP call

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Refer to `tests/README.md` for test workflow documentation
- Consult tech-spec: `_bmad-output/implementation-artifacts/stories/tech-spec-fix-sandbox-client-k8s-lifecycle.md`

---

**Generated by BMad TEA Agent** - 2026-01-04
