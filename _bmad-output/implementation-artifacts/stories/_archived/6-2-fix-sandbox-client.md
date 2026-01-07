# Story 6.2.1: Fix GKE Sandbox Client Integration

---
## ⚠️ STORY CANCELLED (2026-01-03)

**Reason:** Superseded by Story 6.2 implementation

This story was created on 2026-01-03, the same day Story 6.2 was completed.
All sandbox client functionality described here was implemented in Story 6.2:

- ✅ Tasks 1-8 complete (sandbox client, tool registration, error handling)
- ✅ 33 unit tests passing
- ✅ Integration gaps resolved (tool registration, traceId propagation)
- ✅ Status: "review" (implementation complete)

**Remaining work** is already tracked in Story 6.2:
- Task 9: Skills filesystem sync (requires infra update)
- Task 12: Latency verification (requires live GKE testing)

**See:** `6-2-execute-code-tool.md` for the authoritative implementation.

**Validated by:** Bob (Scrum Master), 2026-01-03
**Validation Report:** `validation-report-6-2-1-fix-sandbox-client-2026-01-03.md`

---

## Original Story Content (For Reference)

**Status:** ~~ready~~ cancelled
**Priority:** ~~critical~~ n/a
**Parent Story:** 6-2-execute-code-tool.md
**Type:** Bug Fix

---

## Problem Statement

The `execute_code` tool is registered and Claude calls it, but **sandbox execution fails with 400 Bad Request**. Investigation revealed the TypeScript client implementation is fundamentally incomplete.

### Evidence from Logs
```
execute_code.start → hasSkillScript:false, codeLength:1247, timeout:30
execute_code.error → "Sandbox execution failed: 400 Bad Request"
```

### Root Cause Analysis

| Issue | Current Implementation | Required |
|-------|----------------------|----------|
| **SandboxClaim lifecycle** | None - hits router directly | Must create K8s SandboxClaim first |
| **Headers** | Only `Content-Type` | Needs `X-Sandbox-ID`, `X-Sandbox-Namespace`, `X-Sandbox-Port` |
| **Request body** | `{ code: "..." }` | `{ command: "python3 -c '...'" }` |
| **Cleanup** | None | Must delete SandboxClaim after execution |

### Verified Working Request

```bash
# 1. Create SandboxClaim first
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

# 2. Wait for ready, then execute with correct headers
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -H "X-Sandbox-ID: test-claim-123" \
  -H "X-Sandbox-Namespace: default" \
  -H "X-Sandbox-Port: 8888" \
  -d '{"command": "python3 -c \"print(2+2)\""}'

# Response: {"stdout":"4\n","stderr":"","exit_code":0}

# 3. Cleanup
kubectl delete sandboxclaim test-claim-123
```

---

## Acceptance Criteria

### AC#1: SandboxClaim Lifecycle Management
**Given** an `execute_code` call  
**When** the sandbox client processes it  
**Then** it must:
1. Create a SandboxClaim via K8s API
2. Wait for claim to be ready (poll or watch)
3. Execute the code
4. Delete the claim (cleanup)

### AC#2: Correct HTTP Headers
**Given** a request to the sandbox router  
**When** sending the execute request  
**Then** include these headers:
- `X-Sandbox-ID: {claim_name}`
- `X-Sandbox-Namespace: default`
- `X-Sandbox-Port: 8888`

### AC#3: Correct Request Format
**Given** Python code to execute  
**When** sending to router  
**Then** wrap as: `{ "command": "python3 -c '<escaped_code>'" }`

### AC#4: Claim Pooling (Optional Performance Enhancement)
**Given** multiple sequential `execute_code` calls  
**When** processing requests  
**Then** optionally reuse a warm claim for 60 seconds before cleanup

### AC#5: Error Handling
**Given** K8s API or sandbox failures  
**When** errors occur  
**Then** return structured error via ToolResult (never throw)

---

## Technical Approach

### Option A: Direct K8s API Calls (Recommended)

Use fetch to call K8s API directly:

```typescript
// Create claim
const claim = await fetch(`${K8S_API}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${K8S_TOKEN}`,
  },
  body: JSON.stringify({
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: { name: `orion-${Date.now()}`, namespace: 'default' },
    spec: { sandboxTemplateRef: { name: 'python-runtime-template' } },
  }),
});
```

**Pros:** No new dependencies, works anywhere with K8s access  
**Cons:** Must handle token auth (service account or kubeconfig)

### Option B: kubectl Subprocess

Shell out to kubectl:

```typescript
import { exec } from 'child_process';

// Create claim
await exec(`kubectl apply -f - <<EOF
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
...
EOF`);

// Wait for ready
await exec(`kubectl wait --for=condition=Ready sandbox/${claimName} --timeout=30s`);
```

**Pros:** Simple, uses existing auth  
**Cons:** Requires kubectl installed, subprocess overhead

### Option C: Persistent Claim (Simplest)

Create one long-lived claim for Orion at startup:

```typescript
// On server startup
const ORION_SANDBOX_CLAIM = 'orion-persistent-sandbox';
await createOrEnsureClaim(ORION_SANDBOX_CLAIM);

// On execute
await executeSandbox({ claimName: ORION_SANDBOX_CLAIM, code: '...' });
```

**Pros:** No per-request K8s overhead  
**Cons:** Single sandbox instance (no parallelism), needs health monitoring

### Recommendation

Start with **Option C** (persistent claim) for simplicity, add **Option A** for parallel execution later.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/tools/code-execution/sandbox-client.ts` | Rewrite with claim lifecycle |
| `src/tools/code-execution/types.ts` | Add claim-related types |
| `src/tools/code-execution/sandbox-client.test.ts` | Update tests for new API |
| `src/config/environment.ts` | Add K8S_API_URL, K8S_TOKEN configs |
| `infra/gke-sandbox/orion-persistent-claim.yaml` | (new) Persistent claim manifest |

---

## Environment Variables Required

```bash
# For K8s API access (Option A)
K8S_API_URL=https://kubernetes.default.svc  # or GKE endpoint
K8S_TOKEN=<service-account-token>

# Already configured
GKE_SANDBOX_ROUTER_URL=http://localhost:8080  # via port-forward locally
```

---

## Reference: Python SDK Behavior

The official Python SDK (`agentic_sandbox`) does this lifecycle:

```python
# sandbox_client.py lines 278-295
def __enter__(self):
    self._create_claim()           # Creates SandboxClaim CRD
    self._wait_for_sandbox_ready() # Watches until Ready condition
    # ... sets up port-forward or uses gateway
    return self

def __exit__(self):
    # Deletes the SandboxClaim
    self.custom_objects_api.delete_namespaced_custom_object(...)
```

Router expects these headers (line 337-341):
```python
headers["X-Sandbox-ID"] = self.claim_name
headers["X-Sandbox-Namespace"] = self.namespace
headers["X-Sandbox-Port"] = str(self.server_port)  # 8888
```

Execute format (line 360-361):
```python
payload = {"command": command}
response = self._request("POST", "execute", json=payload)
```

---

## Testing Plan

1. **Unit test:** Mock K8s API and verify claim creation/deletion
2. **Integration test:** Create real claim, execute code, verify output, delete
3. **E2E test:** Send Slack message that triggers code execution, verify response

---

## Definition of Done

- [ ] SandboxClaim created before execution
- [ ] Correct headers sent to router
- [ ] Code wrapped in `python3 -c` command format
- [ ] Claim deleted after execution (or persistent claim stays alive)
- [ ] All 33 existing tests still pass
- [ ] E2E test: "@Orion calculate 2+2 with Python" returns "4"

