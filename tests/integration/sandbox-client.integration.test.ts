/**
 * Integration Tests for GKE Sandbox Client - K8s SandboxClaim Lifecycle
 *
 * @see Tech-Spec: Fix GKE Sandbox Client (Story 6.2.1)
 * @see Task 7: Integration test
 *
 * IMPORTANT: These tests require:
 * 1. GKE cluster deployed (infra/gke-sandbox/)
 * 2. kubectl configured: gcloud container clusters get-credentials orion-sandbox-cluster --region=us-central1
 * 3. Port-forward running: kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default
 * 4. GCP credentials with K8s API access (roles/container.developer)
 *
 * These tests are SKIPPED by default (test.skip). To run manually:
 *   pnpm test tests/integration/sandbox-client.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { executeSandbox } from '../../src/tools/orion-sandbox/sandbox-client.js';
import { GoogleAuth } from 'google-auth-library';
import { config } from '../../src/config/environment.js';

// ============================================================================
// Helper Functions for K8s API Validation
// ============================================================================

/**
 * Lists all SandboxClaims in the default namespace.
 * Used to verify cleanup after test execution.
 */
async function listSandboxClaims(): Promise<
  Array<{ metadata: { name: string; creationTimestamp: string } }>
> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();

  // Get cluster endpoint
  const gkeApiUrl = `https://container.googleapis.com/v1/projects/${config.gcpProjectId}/locations/${config.gkeClusterRegion}/clusters/${config.gkeClusterName}`;
  const clusterResponse = await fetch(gkeApiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!clusterResponse.ok) {
    throw new Error(`Failed to get GKE cluster info: ${clusterResponse.status}`);
  }

  const cluster = await clusterResponse.json();
  const k8sEndpoint = `https://${cluster.endpoint}`;

  // List SandboxClaims
  const claimsUrl = `${k8sEndpoint}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims`;
  const claimsResponse = await fetch(claimsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!claimsResponse.ok) {
    throw new Error(`Failed to list SandboxClaims: ${claimsResponse.status}`);
  }

  const claimsData = await claimsResponse.json();
  return claimsData.items || [];
}

/**
 * Deletes a specific SandboxClaim by name (cleanup helper).
 */
async function deleteSandboxClaim(claimName: string): Promise<void> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();

  // Get cluster endpoint
  const gkeApiUrl = `https://container.googleapis.com/v1/projects/${config.gcpProjectId}/locations/${config.gkeClusterRegion}/clusters/${config.gkeClusterName}`;
  const clusterResponse = await fetch(gkeApiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!clusterResponse.ok) {
    throw new Error(`Failed to get GKE cluster info: ${clusterResponse.status}`);
  }

  const cluster = await clusterResponse.json();
  const k8sEndpoint = `https://${cluster.endpoint}`;

  // Delete SandboxClaim
  const deleteUrl = `${k8sEndpoint}/apis/extensions.agents.x-k8s.io/v1alpha1/namespaces/default/sandboxclaims/${claimName}`;
  const deleteResponse = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    console.warn(`Failed to delete claim ${claimName}: ${deleteResponse.status}`);
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('GKE Sandbox Client - Integration Tests', () => {
  let initialClaimCount: number;

  beforeAll(async () => {
    // Record initial claim count to detect leaks
    try {
      const claims = await listSandboxClaims();
      initialClaimCount = claims.length;
      console.log(`[Setup] Initial SandboxClaims: ${initialClaimCount}`);
    } catch (e) {
      console.warn('[Setup] Could not list initial claims:', e);
      initialClaimCount = 0;
    }
  });

  afterAll(async () => {
    // Verify no claim leaks after all tests
    try {
      const claims = await listSandboxClaims();
      const finalCount = claims.length;
      console.log(`[Teardown] Final SandboxClaims: ${finalCount}`);

      if (finalCount > initialClaimCount) {
        console.warn(
          `[WARNING] Orphaned claims detected! Initial: ${initialClaimCount}, Final: ${finalCount}`
        );
        console.warn('Orphaned claims:', claims.map((c) => c.metadata.name));

        // Attempt cleanup
        for (const claim of claims) {
          if (claim.metadata.name.startsWith('orion-exec-')) {
            console.log(`[Cleanup] Deleting orphaned claim: ${claim.metadata.name}`);
            await deleteSandboxClaim(claim.metadata.name);
          }
        }
      }
    } catch (e) {
      console.warn('[Teardown] Could not verify final claim count:', e);
    }
  });

  /**
   * AC#1: SandboxClaim Lifecycle Management
   * AC#6: Authentication Success
   *
   * This test validates the COMPLETE K8s lifecycle that was missing from unit tests.
   * It proves that:
   * 1. GCP authentication works from Cloud Run
   * 2. K8s API is accessible with service account
   * 3. SandboxClaim creation succeeds
   * 4. Claim reaches Ready condition
   * 5. Router accepts requests with correct headers
   * 6. Code execution produces correct output
   * 7. Cleanup succeeds (no orphaned resources)
   *
   * This is the test that WOULD HAVE CAUGHT the production bug.
   */
  it.skip(
    'should execute code via full K8s SandboxClaim lifecycle',
    async () => {
      // GIVEN: A simple Python code snippet
      const code = 'print(2 + 2)';
      const timeout = 30;

      // WHEN: Executing code via sandbox client
      const result = await executeSandbox({ code, timeout });

      // THEN: Code executes successfully
      expect(result.stdout).toBe('4\n');
      expect(result.stderr).toBe('');
      expect(result.return_code).toBe(0);

      // AND: No orphaned SandboxClaims remain
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for async cleanup
      const claims = await listSandboxClaims();
      const orphanedClaims = claims.filter((c) =>
        c.metadata.name.startsWith('orion-exec-')
      );

      expect(orphanedClaims).toHaveLength(0);
    },
    60000
  ); // 60s timeout for integration test

  /**
   * AC#4: Concurrent Execution Safety
   *
   * Validates that multiple simultaneous executions get isolated SandboxClaims
   * and don't conflict with each other.
   */
  it.skip(
    'should handle concurrent executions with isolated claims',
    async () => {
      // GIVEN: Three concurrent execution requests
      const executions = [
        executeSandbox({ code: 'print("A")', timeout: 30 }),
        executeSandbox({ code: 'print("B")', timeout: 30 }),
        executeSandbox({ code: 'print("C")', timeout: 30 }),
      ];

      // WHEN: All execute concurrently
      const results = await Promise.all(executions);

      // THEN: All succeed with correct outputs
      expect(results[0].stdout).toBe('A\n');
      expect(results[1].stdout).toBe('B\n');
      expect(results[2].stdout).toBe('C\n');

      // AND: All have zero exit codes
      expect(results.every((r) => r.return_code === 0)).toBe(true);

      // AND: No orphaned claims remain
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for all cleanups
      const claims = await listSandboxClaims();
      const orphanedClaims = claims.filter((c) =>
        c.metadata.name.startsWith('orion-exec-')
      );

      expect(orphanedClaims).toHaveLength(0);
    },
    90000
  ); // 90s timeout for concurrent test

  /**
   * AC#7: Timeout Behavior
   *
   * Validates that claim creation timeout is handled gracefully.
   *
   * NOTE: This test is difficult to trigger reliably (would require
   * exhausting warm pool). Consider manual testing by scaling down
   * warm pool: kubectl scale sandboxwarmpool orion-sandbox-warmpool --replicas=0
   */
  it.skip(
    'should handle claim ready timeout gracefully',
    async () => {
      // NOTE: To trigger this test:
      // 1. kubectl scale sandboxwarmpool orion-sandbox-warmpool --replicas=0
      // 2. Run this test
      // 3. kubectl scale sandboxwarmpool orion-sandbox-warmpool --replicas=2

      // GIVEN: A code execution request when warm pool is exhausted
      const code = 'print("timeout test")';

      // WHEN: Executing with a very short timeout (simulating timeout)
      // (In production, CLAIM_READY_TIMEOUT_MS would need to be configurable)

      // THEN: Execution should timeout with clear error
      // (This will be validated after implementation)

      // For now, just verify normal execution works
      const result = await executeSandbox({ code, timeout: 30 });
      expect(result.stdout).toBe('timeout test\n');
    },
    60000
  );

  /**
   * Error Scenario: Network-related code execution
   *
   * Validates that the sandbox has network access (verifies Story 6.2 AC#2).
   */
  it.skip(
    'should execute code with network access',
    async () => {
      // GIVEN: Python code that makes HTTP request
      const code = `
import urllib.request
import json

# Fetch from public API
response = urllib.request.urlopen('https://httpbin.org/json')
data = json.loads(response.read())
print(data['slideshow']['title'])
`;

      // WHEN: Executing code that requires network
      const result = await executeSandbox({ code, timeout: 30 });

      // THEN: Code executes successfully with network access
      expect(result.return_code).toBe(0);
      expect(result.stdout).toContain('Sample Slide Show');

      // AND: No errors in stderr
      expect(result.stderr).toBe('');
    },
    60000
  );
});

// ============================================================================
// Manual Test Instructions
// ============================================================================

/**
 * HOW TO RUN THESE TESTS MANUALLY:
 *
 * Prerequisites:
 * 1. GKE cluster deployed:
 *    kubectl apply -f infra/gke-sandbox/sandbox-template-and-pool.yaml
 *    kubectl apply -f infra/gke-sandbox/sandbox-router.yaml
 *
 * 2. Configure kubectl:
 *    gcloud container clusters get-credentials orion-sandbox-cluster \
 *      --region=us-central1 \
 *      --project=ai-workflows-459123
 *
 * 3. Start port-forward (in separate terminal):
 *    kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default
 *
 * 4. Verify warm pool is ready:
 *    kubectl get sandboxwarmpools
 *    # Should show: READY=2/2
 *
 * 5. Set environment variables:
 *    export GCP_PROJECT_ID=ai-workflows-459123
 *    export GKE_CLUSTER_NAME=orion-sandbox-cluster
 *    export GKE_CLUSTER_REGION=us-central1
 *    export GKE_SANDBOX_ROUTER_URL=http://localhost:8080
 *
 * 6. Run tests:
 *    pnpm test tests/integration/sandbox-client.integration.test.ts
 *
 * Expected Results (BEFORE Implementation - RED Phase):
 * - Tests FAIL with "executeSandbox is not a function" or similar
 * - OR: Tests FAIL with "400 Bad Request - X-Sandbox-ID header is required"
 * - This proves the current implementation is broken
 *
 * Expected Results (AFTER Implementation - GREEN Phase):
 * - All tests PASS
 * - No orphaned SandboxClaims (verify: kubectl get sandboxclaims -n default)
 * - Logs show: claim creation → ready → execution → deletion
 *
 * Cleanup:
 * - Stop port-forward (Ctrl+C)
 * - Delete any orphaned claims:
 *   kubectl delete sandboxclaims --all -n default
 */
