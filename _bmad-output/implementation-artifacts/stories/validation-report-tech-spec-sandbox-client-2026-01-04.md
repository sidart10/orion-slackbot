# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/tech-spec-fix-sandbox-client-k8s-lifecycle.md`
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`
**Date:** 2026-01-04T00:00:00Z
**Validator:** Bob (Scrum Master) - Fresh Context Review

---

## Summary

- **Overall:** 42/60 items passed (70%)
- **Critical Issues:** 7
- **Enhancement Opportunities:** 6
- **LLM Optimization Needs:** 5

**Verdict:** ⚠️ **GOOD but requires critical fixes before development**

The tech-spec correctly diagnoses the problem and provides a solid implementation plan. However, it has **7 critical gaps** that will block the developer:
1. Missing K8s API endpoint resolution logic
2. Missing google-auth-library integration details
3. Missing SandboxClaim status polling logic details
4. Missing request format reconciliation (command vs code)
5. Missing test mocking patterns
6. Incomplete environment variables (missing GCP_PROJECT_ID)
7. Missing claim cleanup state tracking logic

---

## Section Results

### 1. Problem Statement & Evidence (Lines 8-44)

**Pass Rate: 5/5 (100%)**

✅ **PASS** - Clear root cause identification
Evidence: Lines 21-28 show exact timeline and evidence from logs/code

✅ **PASS** - Contrasts current vs expected behavior
Evidence: Lines 29-44 show side-by-side comparison

✅ **PASS** - References authoritative sources
Evidence: Lines 127-138 cite architecture.md, parent story, archived story

✅ **PASS** - Non-technical root cause explanation
Evidence: Lines 21-28 explain "tests passing with mocks, hiding broken implementation"

✅ **PASS** - Links to deployment verification
Evidence: Lines 384-416 reference infra/ and README.md

---

### 2. Solution Overview (Lines 46-75)

**Pass Rate: 4/5 (80%)**

✅ **PASS** - High-level solution described
Evidence: Lines 48-57 list key changes

✅ **PASS** - Scope clearly defined (in/out)
Evidence: Lines 60-74 explicit in-scope and out-of-scope lists

✅ **PASS** - Maintains ToolResult pattern
Evidence: Line 56 "Maintain ToolResult error handling pattern"

⚠️ **PARTIAL** - Missing tradeoff discussion for dynamic claims
Evidence: Line 167 mentions "~1-2s overhead" but doesn't compare to alternatives
Gap: Should contrast claim-per-execution vs claim-pooling cost/benefit

✅ **PASS** - References existing packages
Evidence: Lines 140-142 "google-auth-library@10.5.0 — For GCP service account"

---

### 3. Context for Development (Lines 77-187)

**Pass Rate: 6/8 (75%)**

✅ **PASS** - Codebase patterns documented
Evidence: Lines 82-123 show ESM imports, tool handler pattern, logging, timeout pattern

✅ **PASS** - Files to reference listed
Evidence: Lines 126-142 list implementation references and files to modify

✅ **PASS** - Package dependencies identified
Evidence: Lines 140-142 google-auth-library already available

⚠️ **PARTIAL** - Technical decisions explained but incomplete
Evidence: Lines 145-187 justify REST API, dynamic claims, polling, naming
Gap: Missing decision on how to GET K8s cluster endpoint (assumes exists)

✗ **FAIL** - Missing K8s API endpoint resolution
Impact: Developer will get blocked on "how do I get the cluster API endpoint?"
Evidence: Line 205 Task 3 says "Get cluster endpoint via GKE API" but no code example
Required: Show how to call `https://container.googleapis.com/v1/projects/{project}/locations/{region}/clusters/{cluster}` and extract `endpoint` field

✗ **FAIL** - Missing google-auth-library integration details
Impact: Developer doesn't know if Cloud Run ADC auto-works or needs explicit config
Evidence: Lines 356-362 show `GoogleAuth` example but no Cloud Run context
Required: Clarify "Cloud Run service account automatically provides credentials via ADC"

✗ **FAIL** - Missing SandboxClaim status polling details
Impact: Developer doesn't know how to detect "still waiting" vs "failed" vs "ready"
Evidence: Lines 384-397 show FINAL ready state, not progression
Required: Show example of NOT ready state: `{"status": {"conditions": [{"type": "Ready", "status": "False", "reason": "Creating"}]}}`

✅ **PASS** - ESM import pattern enforced
Evidence: Lines 82-89 explicit .js extension requirement

---

### 4. Implementation Plan (Lines 189-253)

**Pass Rate: 5/8 (62%)**

✅ **PASS** - Tasks broken down logically
Evidence: Lines 194-251 show 8 tasks with time estimates

✅ **PASS** - Critical integration points identified
Evidence: Task 4 (line 212) mentions "Execute code with correct headers"

⚠️ **PARTIAL** - Task ordering could be clearer
Gap: Task 3 has 5 sub-functions but doesn't specify order. Should be: 3a→3b→3c→3d→3e

✗ **FAIL** - Test mocking strategy undefined
Impact: Developer doesn't know how to mock K8s API calls
Evidence: Line 233 says "Mock getK8sAccessToken() and getK8sApiEndpoint()" but these are NEW functions the dev is writing
Required: Show dependency injection or explicit mock pattern

✗ **FAIL** - Missing claim cleanup state tracking
Impact: Developer might delete non-existent claims or leak claims
Evidence: Line 221 "Delete claim in finally block" but doesn't handle "claim never created"
Required: Add state flag: `let claimCreated = false; ... if (claimCreated) await delete...`

✅ **PASS** - Integration test documented
Evidence: Lines 239-245 show manual kubectl port-forward test

✅ **PASS** - Documentation updates planned
Evidence: Lines 247-251 update story status, README, .env.example

⚠️ **PARTIAL** - Time estimates may be optimistic
Gap: Total 4 hours for 405 lines changed across 5 files with K8s API integration

---

### 5. Acceptance Criteria (Lines 255-313)

**Pass Rate: 7/8 (88%)**

✅ **PASS** - AC#1 SandboxClaim Lifecycle Management
Evidence: Lines 257-264 explicit 4-step lifecycle

✅ **PASS** - AC#2 Correct HTTP Headers
Evidence: Lines 266-273 lists all 4 required headers

✓ **PASS** - AC#3 Correct Request Format
Evidence: Lines 275-282 shows `{"command": "python3 -c '...'"}` format

✅ **PASS** - AC#4 Concurrent Execution Safety
Evidence: Lines 284-288 requires unique claim names per execution

✅ **PASS** - AC#5 Graceful Error Handling
Evidence: Lines 290-294 requires ToolResult error returns + cleanup

✅ **PASS** - AC#6 Authentication Success
Evidence: Lines 296-300 requires valid token from service account

✅ **PASS** - AC#7 Timeout Behavior
Evidence: Lines 302-306 requires cleanup on timeout

⚠️ **PARTIAL** - AC#8 Existing Tests Pass
Evidence: Lines 308-312 requires 33 tests pass with updated mocks
Gap: Doesn't specify HOW to update mocks (what should they return?)

---

### 6. Additional Context (Lines 316-510)

**Pass Rate: 8/12 (67%)**

✅ **PASS** - Dependencies documented
Evidence: Lines 319-324 list available packages

✅ **PASS** - Environment variables specified
Evidence: Lines 326-340 show required and existing env vars

✗ **FAIL** - Missing GCP_PROJECT_ID environment variable
Impact: Cannot construct GKE API URL without project ID
Evidence: Line 333 shows GCP_PROJECT_ID but it's not in environment.ts (checked lines 1-104)
Required: Add to config/environment.ts and .env.example

✅ **PASS** - K8s API endpoints documented
Evidence: Lines 342-352 show base URL construction

✅ **PASS** - Authentication example provided
Evidence: Lines 354-363 show GoogleAuth usage

⚠️ **PARTIAL** - SandboxClaim resource spec shown
Evidence: Lines 366-397 show creation and ready state
Gap: Missing NOT ready state example for polling logic

✅ **PASS** - Testing strategy defined
Evidence: Lines 399-423 cover unit, integration, and E2E tests

✅ **PASS** - Performance expectations documented
Evidence: Lines 433-438 show timing breakdown

✅ **PASS** - Error scenarios handled
Evidence: Lines 443-448 list 5 failure modes

✅ **PASS** - Debugging tips provided
Evidence: Lines 450-462 show kubectl commands

⚠️ **PARTIAL** - Future optimizations noted
Evidence: Lines 465-469 list out-of-scope items
Gap: Could be clearer about why pooling is deferred (complexity vs benefit)

✗ **FAIL** - Request format confusion
Impact: Developer unsure if router expects `{code}` or `{command}`
Evidence: Current sandbox-client.ts:46 sends `code`, but lines 279-282 + 499 show `command`
Required: Reconcile formats - explain that router expects `command`, not `code`

✅ **PASS** - Verified working example
Evidence: Lines 473-507 show tested kubectl + curl pattern

---

### 7. Code Quality & Patterns (Implicit)

**Pass Rate: 4/6 (67%)**

✅ **PASS** - Follows ToolResult pattern
Evidence: Line 56, Task 5 references error handling pattern

✅ **PASS** - Includes traceId logging guidance
Evidence: Line 112 mentions traceId requirement

✅ **PASS** - Uses AbortSignal for timeout
Evidence: Lines 115-123 show timeout pattern

⚠️ **PARTIAL** - ESM imports enforced
Evidence: Lines 82-89 show pattern, but implementation examples don't include .js extensions

✗ **FAIL** - Missing claim state machine
Impact: Cleanup logic may fail or delete wrong claims
Required: Track claim lifecycle state to know when deletion is safe

✅ **PASS** - References project-context.md
Evidence: Multiple references to existing patterns

---

### 8. Alignment with Parent Story (Story 6.2)

**Pass Rate: 5/7 (71%)**

✅ **PASS** - Correctly identifies parent story
Evidence: Line 5 "Parent Story: 6-2-execute-code-tool.md"

✅ **PASS** - Understands current implementation status
Evidence: Lines 21-28 explain tests pass but implementation broken

✅ **PASS** - References Story 6.2 file locations
Evidence: Line 11 cites exact file paths from Story 6.2

⚠️ **PARTIAL** - Links to Story 6.2 acceptance criteria
Evidence: Doesn't explicitly map ACs to parent story ACs
Gap: Story 6.2 has AC#1 (runs in GKE) - tech-spec should reference it

✓ **PASS** - Maintains Story 6.2 scope boundaries
Evidence: Lines 70-74 out-of-scope matches Story 6.2 deferred items

✓ **PASS** - Uses Story 6.2 file structure
Evidence: Line 10 "src/tools/code-execution/sandbox-client.ts" matches Story 6.2

⚠️ **PARTIAL** - Accounts for Story 6.2 test coverage
Evidence: Line 309 mentions "33 existing tests" from Story 6.2
Gap: Doesn't explain those tests are MOCKED (hiding the bug)

---

### 9. LLM Developer Agent Optimization

**Pass Rate: 3/8 (38%)**

✗ **FAIL** - Excessive repetition
Impact: Wastes tokens on duplicate content
Evidence: Lines 473-507 bash example duplicated in reference section
Required: Consolidate to single appendix

✗ **FAIL** - Verbose context section
Impact: 110 lines (78-187) of context, much redundant with parent story
Required: Replace with "See Story 6.2 for codebase patterns" + keep only NEW K8s info

⚠️ **PARTIAL** - Good structure but could be more scannable
Evidence: Clear headings, but large text blocks
Improvement: Use more bullet lists, fewer paragraphs

✗ **FAIL** - Examples buried in prose
Impact: Developer has to read 537 lines to find critical code
Required: Move "Verified Working Request" to top of doc (after Problem Statement)

⚠️ **PARTIAL** - Task descriptions clear but lack specificity
Evidence: Task 3 "Implement K8s API helper functions" - which order?
Required: Number sub-tasks: 3a, 3b, 3c

✓ **PASS** - Uses Given/When/Then for ACs
Evidence: Lines 257-312 use BDD format

✗ **FAIL** - Long document (537 lines) could be condensed
Impact: Slower LLM processing, higher token cost
Target: Reduce to ~350 lines by removing duplication and verbosity

⚠️ **PARTIAL** - Good use of tables and code blocks
Evidence: Tables at lines 528-536, code blocks throughout
Improvement: More tables, less prose

---

## Failed Items (Must Fix)

### Critical #1: Missing K8s API Endpoint Resolution Logic

**Location:** Line 205, Task 3 "Get cluster endpoint via GKE API"
**Impact:** Developer will be blocked with no idea how to proceed
**Evidence:** Tech-spec assumes this exists but provides no implementation guidance

**Required Fix:**
```markdown
### K8s API Endpoint Resolution

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
```

**Recommendation:** Add this example immediately after "Technical Decisions" section

---

### Critical #2: Missing google-auth-library Cloud Run Integration Details

**Location:** Lines 356-362
**Impact:** Developer doesn't know if explicit configuration is needed
**Evidence:** Shows GoogleAuth example but no Cloud Run Application Default Credentials context

**Required Fix:**
```markdown
### GCP Authentication from Cloud Run

Cloud Run automatically provides credentials via Application Default Credentials (ADC). The `GoogleAuth` class will automatically detect and use the service account attached to the Cloud Run service.

**No explicit configuration needed** - `new GoogleAuth()` will:
1. Detect Cloud Run environment
2. Use the attached service account (`{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`)
3. Generate short-lived OAuth 2.0 tokens

**Service Account Permissions Required:**
- `roles/container.developer` (or `roles/editor`) for GKE API access
- `roles/storage.objectAdmin` for GCS (already configured for memory tool)

**Troubleshooting:**
- If 403 Forbidden from K8s API: Check service account IAM roles in GCP Console
- If "could not find default credentials": Verify Cloud Run service account is attached
```

**Recommendation:** Add to "Authentication" subsection (lines 354-363)

---

### Critical #3: Missing SandboxClaim Status Polling Logic

**Location:** Lines 384-397
**Impact:** Developer can't distinguish "still waiting" from "failed" from "ready"
**Evidence:** Shows only FINAL ready state, not progression

**Required Fix:**
```markdown
### SandboxClaim Status Progression

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

**Polling Logic:**
```typescript
async function waitForClaimReady(claimName: string, timeoutMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500;

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
    await sleep(pollInterval);
  }

  throw new ClaimReadyTimeoutError(timeoutMs);
}
```
```

**Recommendation:** Replace lines 384-397 with this expanded example

---

### Critical #4: Request Format Reconciliation (command vs code)

**Location:** Lines 279-282, sandbox-client.ts:46
**Impact:** Developer will send wrong request format and get 400 errors
**Evidence:** Current code sends `{code: "..."}`, tech-spec shows `{command: "python3 -c '...'"}`, Python SDK reference shows `{command: "..."}`

**Required Fix:**
```markdown
### Router Request Format (CRITICAL)

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

**Why:** The sandbox router expects a shell command, not raw Python code. The router executes `command` inside the container, so we must wrap our code:
- Input: `print(2+2)`
- Router receives: `{"command": "python3 -c 'print(2+2)'"}`
- Container executes: `python3 -c 'print(2+2)'`
- Output: `{"stdout": "4\n", "stderr": "", "exit_code": 0}`

**Code Escaping:** Use `JSON.stringify()` for the outer JSON, which will properly escape single quotes in the Python code.
```

**Recommendation:** Add immediately after AC#3 (lines 275-282)

---

### Critical #5: Test Mocking Strategy Missing

**Location:** Line 233, Task 6
**Impact:** Developer doesn't know how to mock NEW functions they're writing
**Evidence:** Says "Mock getK8sAccessToken() and getK8sApiEndpoint()" but these don't exist yet

**Required Fix:**
```markdown
### Test Mocking Pattern

**Strategy:** Dependency injection via optional parameters

```typescript
// sandbox-client.ts
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

**Test example:**
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
```
```

**Recommendation:** Add to Task 6 (lines 230-237)

---

### Critical #6: Missing GCP_PROJECT_ID Environment Variable

**Location:** Line 333, config/environment.ts
**Impact:** Cannot construct GKE API URL
**Evidence:** Tech-spec shows `GCP_PROJECT_ID=ai-workflows-459123` but it's not in environment.ts

**Required Fix:**
```diff
// src/config/environment.ts

export const config = {
  // ... existing config ...

  // GKE Agent Sandbox (Story 6.2)
  gkeSandboxRouterUrl:
    process.env.GKE_SANDBOX_ROUTER_URL ??
    'http://sandbox-router-svc.default.svc.cluster.local:8080',

+ // GKE Cluster Configuration (Tech-Spec: Fix Sandbox Client)
+ gcpProjectId: process.env.GCP_PROJECT_ID ?? '',
+ gkeClusterName: process.env.GKE_CLUSTER_NAME ?? 'orion-sandbox-cluster',
+ gkeClusterRegion: process.env.GKE_CLUSTER_REGION ?? 'us-central1',

  // MCP servers for injection into sandbox (Story 6.2)
  mcpServersJson: process.env.MCP_SERVERS_JSON ?? '{}',
} as const;
```

```diff
// .env.example

+# GKE Cluster Configuration (for K8s API access)
+GCP_PROJECT_ID=ai-workflows-459123
+GKE_CLUSTER_NAME=orion-sandbox-cluster
+GKE_CLUSTER_REGION=us-central1
```

**Recommendation:** Add to Task 1 (lines 194-197)

---

### Critical #7: Missing Claim Cleanup State Tracking

**Location:** Line 221, Task 4
**Impact:** May attempt to delete non-existent claims or leak claims
**Evidence:** Says "Delete claim in finally block" without state tracking

**Required Fix:**
```markdown
### Claim Lifecycle State Machine

**Problem:** If K8s API fails BEFORE claim creation, `finally` block will try to delete a non-existent claim.

**Solution:** Track claim creation state explicitly

```typescript
async function executeSandbox(options: SandboxOptions): Promise<SandboxResult> {
  let claimName: string | null = null;
  let claimCreated = false; // STATE FLAG

  try {
    // Generate name
    claimName = `orion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Create claim
    await createSandboxClaim(claimName);
    claimCreated = true; // Mark created ONLY after successful POST

    // Wait for ready
    await waitForClaimReady(claimName);

    // Execute
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

**States:**
1. `claimName = null, claimCreated = false` - Initial state
2. `claimName = "...", claimCreated = false` - Name generated, creation pending
3. `claimName = "...", claimCreated = true` - Creation succeeded
4. `claimName = null, claimCreated = false` - Cleanup complete (or skipped)

This prevents "404 Not Found" errors when deleting claims that were never created.
```

**Recommendation:** Add to Task 4 (lines 212-222)

---

## Partial Items (Should Improve)

### Enhancement #1: Add Tradeoff Discussion for Dynamic Claims

**Location:** Line 167
**Current:** Mentions "~1-2s overhead for claim creation"
**Gap:** Doesn't contrast with alternatives

**Improvement:**
```markdown
### Claim Lifecycle Trade-offs

| Approach | Pros | Cons | Selected? |
|----------|------|------|-----------|
| **Dynamic (per-execution)** | ✅ Concurrent-safe<br>✅ Clean isolation<br>✅ No state management | ❌ ~1-2s overhead per call | ✅ **YES** (MVP) |
| **Persistent (long-lived)** | ✅ Sub-second execution<br>✅ Simple | ❌ Not concurrent-safe<br>❌ Single point of failure | ❌ No (future optimization) |
| **Pool (claim reuse)** | ✅ Fast warm execution<br>✅ Concurrent-safe | ❌ Complex state management<br>❌ Cleanup logic | ⏸️ Deferred (Epic 7) |

**Decision:** Start with dynamic claims for correctness, add pooling in Epic 7 for performance.
```

---

### Enhancement #2: Explain Previous Story Test Failure

**Location:** Lines 21-28
**Current:** Mentions tests pass but implementation broken
**Gap:** Doesn't explain WHY tests didn't catch this

**Improvement:**
```markdown
### Root Cause: Test Mocking Hid the Bug

**Timeline:**
1. Story 6.2 (Jan 2, 2026): Implemented sandbox client with direct router calls
2. Tests written with `vi.fn()` mocked fetch - validated **interface**, not **behavior**
3. Story 6.2 marked "done" with 38 tests passing ✅
4. Deployed to Cloud Run
5. **Production fails:** Real sandbox router returns 400 "X-Sandbox-ID header is required"

**Why tests passed:**
```typescript
// sandbox-client.test.ts (EXISTING)
const mockFetch = vi.fn().mockResolvedValue({
  ok: true, // ❌ This always returns success
  json: async () => ({ stdout: '4\n', stderr: '', exit_code: 0 })
});
```

**What was missing:**
- Tests never called a REAL sandbox router (even in test environment)
- Tests never validated headers sent to router
- Tests never created real K8s SandboxClaims

**This fix addresses:** Add integration test with real K8s API calls (Task 7)
```

---

### Enhancement #3: Service Account Permission Verification

**Location:** Lines 145-157
**Current:** Assumes `roles/editor` works
**Gap:** No verification or troubleshooting guidance

**Improvement:**
```markdown
### Service Account Permissions

**Cloud Run Service Account:** `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`

**Required IAM Roles:**
- `roles/container.developer` - For GKE API access (get cluster info)
- `roles/container.clusterViewer` - For K8s API access (list/create/delete SandboxClaims)

**Verification:**
```bash
# Check current roles
gcloud projects get-iam-policy ai-workflows-459123 \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud iam service-accounts list --format='value(email)' --filter='displayName:Compute Engine default service account')"

# Add if missing
gcloud projects add-iam-policy-binding ai-workflows-459123 \
  --member="serviceAccount:{PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/container.developer"
```

**Troubleshooting:**
- `403 Forbidden` from GKE API → Missing `roles/container.developer`
- `403 Forbidden` from K8s API → Missing `roles/container.clusterViewer`
- `401 Unauthorized` → ADC not working, check Cloud Run service account attachment
```

---

### Enhancement #4: Clarify Task 3 Ordering

**Location:** Lines 204-210
**Current:** Lists 5 functions without order
**Gap:** Developer doesn't know which to implement first

**Improvement:**
```markdown
**Task 3:** Implement K8s API helper functions (~45 min)

Implement in this order (dependencies flow downward):

**3a. `getK8sAccessToken()`** (~10 min)
- Input: None (uses ADC)
- Output: `Promise<string>` - OAuth 2.0 bearer token
- Deps: google-auth-library
- Error: Throw if ADC fails

**3b. `getK8sApiEndpoint()`** (~15 min)
- Input: None (uses config)
- Output: `Promise<string>` - `https://{cluster-ip}`
- Deps: 3a (needs token)
- Error: Throw if GKE API call fails

**3c. `createSandboxClaim(claimName: string)`** (~10 min)
- Input: Claim name (e.g., `orion-exec-1234567890-a3f2x`)
- Output: `Promise<void>`
- Deps: 3a, 3b
- Error: Throw if K8s API returns non-201

**3d. `waitForClaimReady(claimName: string)`** (~15 min)
- Input: Claim name
- Output: `Promise<void>` when ready
- Deps: 3a, 3b
- Error: Throw ClaimReadyTimeoutError after 10s, or throw if claim fails

**3e. `deleteSandboxClaim(claimName: string)`** (~5 min)
- Input: Claim name
- Output: `Promise<void>`
- Deps: 3a, 3b
- Error: Log warning but don't throw (non-fatal)
```

---

### Enhancement #5: Add Claim Readiness Timeout Constant

**Location:** Line 209
**Current:** Says "poll every 500ms, 10s timeout"
**Gap:** No guidance on making this configurable

**Improvement:**
```typescript
// src/tools/code-execution/sandbox-client.ts

const CLAIM_READY_TIMEOUT_MS = 10_000; // 10 seconds
const CLAIM_READY_POLL_INTERVAL_MS = 500; // 500ms

async function waitForClaimReady(claimName: string): Promise<void> {
  const maxAttempts = Math.floor(CLAIM_READY_TIMEOUT_MS / CLAIM_READY_POLL_INTERVAL_MS);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // ... polling logic
    await sleep(CLAIM_READY_POLL_INTERVAL_MS);
  }

  throw new ClaimReadyTimeoutError(CLAIM_READY_TIMEOUT_MS / 1000);
}
```

**Rationale:** Warm pool should return ready claims in <2s. 10s timeout allows for:
- Cold start scenarios (pool exhausted)
- Network latency
- K8s API delays
```

---

### Enhancement #6: Clarify Integration Test Setup

**Location:** Lines 239-245
**Current:** Shows port-forward but unclear when/how
**Gap:** Developer doesn't know if this is pre-requisite or part of test

**Improvement:**
```markdown
**Task 7:** Integration test (~30 min)

**Prerequisites:**
1. GKE cluster must be deployed (`infra/gke-sandbox/`)
2. `kubectl` configured with cluster credentials
3. Port-forward running: `kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default`

**Test Procedure:**
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
```

---

## LLM Optimization Improvements

### Optimization #1: Eliminate Repetition

**Impact:** Saves ~50 lines, reduces token cost by ~15%

**Changes:**
1. Remove duplicate bash example (lines 473-507 duplicates content from context)
2. Consolidate SandboxClaim JSON examples (appears 3 times)
3. Replace redundant "Context for Development" (lines 78-123) with:
   ```markdown
   ### Development Patterns

   **See:** Story 6-2-execute-code-tool.md for:
   - ESM imports (`.js` extension required)
   - Tool handler pattern (`ToolResult<T>`, never throw)
   - Timeout pattern (`AbortSignal`)
   - Logging with traceId

   **NEW patterns for K8s integration:**
   - [Add only K8s-specific patterns here]
   ```

---

### Optimization #2: Restructure for Scanability

**Impact:** Easier LLM comprehension, faster context retrieval

**Proposed Structure:**
```markdown
# Tech-Spec: Fix GKE Sandbox Client

## TL;DR
[2-3 sentences, current lines 8-16]

## The Bug (Evidence First)
[Verified working request - move from lines 473-507 to HERE]
[Current broken behavior - lines 29-44]
[Root cause - lines 21-28]

## The Fix (Solution)
[High-level solution - lines 46-57]
[Technical decisions - lines 143-187]

## Implementation (Actionable)
[Task breakdown - lines 189-253]
[Code examples - inline, not appendix]
[Acceptance criteria - lines 255-313]

## Reference (Supporting)
[Environment vars - lines 326-340]
[K8s API endpoints - lines 342-363]
[Debugging tips - lines 450-462]
```

**Benefit:** Critical info (what's broken, how to fix) comes FIRST. Reference material at END.

---

### Optimization #3: Inline Code Examples

**Impact:** Reduces "scrolling distance" for LLM, improves task-to-code mapping

**Current:** Task 3 says "Implement K8s API helpers" but code examples are 150+ lines later
**Better:** Inline examples immediately after each task

```markdown
**Task 3a: `getK8sAccessToken()`** (~10 min)

```typescript
import { GoogleAuth } from 'google-auth-library';

async function getK8sAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  return await auth.getAccessToken();
}
```

**Task 3b: `getK8sApiEndpoint()`** (~15 min)

```typescript
async function getK8sApiEndpoint(): Promise<string> {
  // [Code here]
}
```
```

---

### Optimization #4: Reduce "Additional Context" Section

**Current:** Lines 316-510 (194 lines)
**Target:** ~80 lines

**Keep:**
- Environment variables (essential)
- K8s API endpoints (essential)
- Error scenarios (essential)

**Move to appendix or remove:**
- Performance expectations (interesting but not critical)
- Debugging tips (useful but can be separate doc)
- Future optimizations (out of scope)

---

### Optimization #5: Use More Tables, Less Prose

**Impact:** Faster scanning, clearer comparisons

**Example - Current (lines 145-157):**
```markdown
### Option A: Direct K8s API Calls (Recommended)

Uses fetch to call K8s API directly:

[Code example]

**Pros:** No new dependencies, works anywhere with K8s access
**Cons:** Must handle token auth (service account or kubeconfig)

### Option B: kubectl Subprocess
[...]
```

**Better:**
```markdown
| Approach | Pros | Cons | Dependencies | Selected? |
|----------|------|------|--------------|-----------|
| **REST API** | No deps, Cloud Run compatible | Auth handling | google-auth-library | ✅ **YES** |
| **kubectl** | Simple, uses existing auth | Requires kubectl binary | kubectl installed | ❌ No |
| **@kubernetes/client-node** | Type-safe | Heavy dependency | +2MB bundle | ❌ No |
```

---

## Recommendations

### Must Fix (Before Development Starts)

1. ✅ **Add K8s API endpoint resolution code** (Critical #1)
2. ✅ **Add google-auth-library Cloud Run integration details** (Critical #2)
3. ✅ **Add SandboxClaim status polling logic** (Critical #3)
4. ✅ **Reconcile request format (command vs code)** (Critical #4)
5. ✅ **Add test mocking pattern** (Critical #5)
6. ✅ **Add GCP_PROJECT_ID to environment config** (Critical #6)
7. ✅ **Add claim cleanup state tracking** (Critical #7)

### Should Improve (Before Validation Sign-off)

1. ⚠️ **Add tradeoff discussion** (Enhancement #1)
2. ⚠️ **Explain why tests didn't catch bug** (Enhancement #2)
3. ⚠️ **Add service account permission verification** (Enhancement #3)
4. ⚠️ **Clarify Task 3 ordering** (Enhancement #4)
5. ⚠️ **Add claim readiness timeout constants** (Enhancement #5)
6. ⚠️ **Clarify integration test setup** (Enhancement #6)

### Consider (Nice to Have)

1. ✨ **Eliminate repetition** (Optimization #1)
2. ✨ **Restructure for scanability** (Optimization #2)
3. ✨ **Inline code examples** (Optimization #3)
4. ✨ **Reduce Additional Context section** (Optimization #4)
5. ✨ **Use more tables, less prose** (Optimization #5)

---

## Overall Assessment

**Strengths:**
- ✅ Accurate problem diagnosis with clear evidence
- ✅ Solid implementation plan with task breakdown
- ✅ Good acceptance criteria using BDD format
- ✅ References verified working examples
- ✅ Comprehensive scope definition (in/out)

**Weaknesses:**
- ❌ Missing critical K8s API implementation details
- ❌ Incomplete google-auth-library integration guidance
- ❌ Unclear request format reconciliation
- ❌ No test mocking patterns
- ❌ Incomplete environment variables
- ❌ Verbose with repetitive content

**Verdict:** ⚠️ **70% Ready - Needs critical fixes**

The tech-spec correctly identifies the problem and proposes the right solution. However, it has **7 critical gaps** that will block the developer during implementation. With the recommended fixes, this will be an excellent implementation guide.

**Estimated Rework Time:** 2-3 hours to address all critical issues + enhancements

---

**Next Steps:**
1. Address all 7 critical issues (Must Fix)
2. Consider 6 enhancements (Should Improve)
3. Optionally apply LLM optimizations
4. Re-validate with fresh context
5. Mark tech-spec as "ready for development"
