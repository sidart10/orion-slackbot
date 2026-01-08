/**
 * Code Execution Tool
 *
 * Exports for GKE Agent Sandbox code execution.
 *
 * @see Story 6.2 - orion_sandbox Tool
 */

export { executeSandbox, SandboxTimeoutError } from './sandbox-client.js';
export {
  orionSandboxHandler,
  orionSandboxToolDefinition,
  registerOrionSandboxTool,
  setOrionSandboxContext,
  clearOrionSandboxContext,
} from './tool.js';
export type {
  OrionSandboxInput,
  OrionSandboxOutput,
  OrionSandboxResult,
  SandboxOptions,
  SandboxResult,
} from './types.js';

export const EXECUTE_CODE_TOOL_NAME = 'orion_sandbox';

export {
  GKE_ONLY_SKILLS,
  isGkeOnlySkill,
  type GkeOnlySkill,
} from './allowed-skills.js';

