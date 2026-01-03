/**
 * GKE Sandbox Client
 *
 * Communicates with the GKE Agent Sandbox Router for secure Python execution.
 *
 * @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
 * @see AC#1 - Code runs in GKE Agent Sandbox
 * @see AC#2 - Network access verified
 * @see infra/gke-sandbox/ for deployment manifests
 */

import { config } from '../../config/environment.js';
import type { SandboxOptions, SandboxResult } from './types.js';

/**
 * Execute Python code in GKE Agent Sandbox.
 *
 * Uses Sandbox Router deployed in Phase 1.
 * See: infra/gke-sandbox/
 *
 * @param options - Code, timeout, and optional environment variables
 * @returns Execution result with stdout, stderr, and return_code
 * @throws Error on network/sandbox failures (caught by handler)
 */
export async function executeSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const routerUrl = config.gkeSandboxRouterUrl;

  const response = await fetch(`${routerUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: options.code,
      timeout_seconds: options.timeout,
      environment: options.env,
      template: 'python-runtime-template',
    }),
    // Timeout with buffer for network overhead
    signal: AbortSignal.timeout(options.timeout * 1000 + 5000),
  });

  if (!response.ok) {
    throw new Error(`Sandbox execution failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as {
    stdout?: string;
    stderr?: string;
    return_code?: number;
  };

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    return_code: result.return_code ?? 0,
  };
}

