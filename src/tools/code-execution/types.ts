/**
 * Types for execute_code tool.
 *
 * @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
 */

import type { ToolResult } from '../../utils/tool-result.js';

export interface ExecuteCodeInput {
  code?: string;
  skill_script?: string; // Format: "skill:skill_name/script_name.py" or "skill_name/script_name.py"
  args?: Record<string, unknown>;
  timeout?: number;
}

export interface ExecuteCodeOutput {
  stdout: string;
  stderr: string;
  return_code: number;
  execution_time_ms: number;
}

export type ExecuteCodeResult = ToolResult<ExecuteCodeOutput>;

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

