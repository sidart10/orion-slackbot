/**
 * Types for orion_sandbox tool.
 *
 * @see Story 6.2 - orion_sandbox Tool (GKE Agent Sandbox)
 */

import type { ToolResult } from '../../utils/tool-result.js';

export interface OrionSandboxInput {
  code?: string;
  skill_script?: string; // Format: "skill:skill_name/script_name.py" or "skill_name/script_name.py"
  skill_doc?: string; // Format: "skill:skill_name" or "skill_name" (loads SKILL.md and prints it)
  args?: Record<string, unknown>;
  timeout?: number;
}

export interface OrionSandboxOutput {
  stdout: string;
  stderr: string;
  return_code: number;
  execution_time_ms: number;
}

export type OrionSandboxResult = ToolResult<OrionSandboxOutput>;

export interface SandboxOptions {
  code: string;
  timeout: number;
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  return_code: number;
}

// K8s SandboxClaim Types (Tech-Spec: Fix Sandbox Client K8s Lifecycle)

export interface SandboxClaimCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface SandboxClaimStatus {
  conditions?: SandboxClaimCondition[];
}

export interface SandboxClaimSpec {
  sandboxTemplateRef: {
    name: string;
  };
}

export interface SandboxClaimMetadata {
  name: string;
  namespace: string;
  creationTimestamp?: string;
  uid?: string;
}

export interface SandboxClaim {
  apiVersion: 'extensions.agents.x-k8s.io/v1alpha1';
  kind: 'SandboxClaim';
  metadata: SandboxClaimMetadata;
  spec: SandboxClaimSpec;
  status?: SandboxClaimStatus;
}

// Dependency injection interface for testing
export interface SandboxClientDeps {
  getK8sApiEndpoint?: () => Promise<string>;
  getK8sAccessToken?: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
}

