/**
 * Vercel Sandbox Module
 *
 * Exports the Vercel sandbox integration for running Anthropic SDK
 * in an isolated environment with proper timeout handling.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 */

export {
  executeAgentInSandbox,
  parseAgentOutput,
  type SandboxExecutionInput,
  type SandboxExecutionResult,
} from './vercel-runtime.js';
