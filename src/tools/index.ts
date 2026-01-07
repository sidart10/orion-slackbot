/**
 * Tools Module
 *
 * Provides tool context generation, MCP integration, and tool execution utilities.
 * Claude Agent SDK handles tool discovery and registry natively.
 *
 * NOTE (2025-12-18): Registry exports removed after course correction.
 * SDK handles tool caching internally — no custom registry needed.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 * @see Story 3.3 - Tool Execution with Timeout
 */

// Context (simplified - SDK handles discovery)
export {
  getToolContextSummary,
  getToolDetails,
  searchTools,
  ESSENTIAL_TOOL_PATTERNS,
  type ToolSchema,
} from './context.js';

// Tool Execution (Story 3.3)
export {
  withToolTimeout,
  executeToolWithTimeout,
  executeToolsInParallel,
  createToolFailureMessage,
  handleToolFailure,
  TOOL_TIMEOUT_MS,
  type ToolResult,
  type ToolCall,
  type ExecuteToolOptions,
} from './execution.js';

// MCP
export * from './mcp/index.js';

// Summarize Tool (Story 7.6)
export {
  registerSummarizeTool,
  setSummarizeToolContext,
  clearSummarizeToolContext,
  SUMMARIZE_TOOL_NAME,
} from './summarize/index.js';

// Memory Tool (Story 5.1)
export {
  setMemoryToolContext,
  clearMemoryToolContext,
  MEMORY_TOOL_NAME,
} from './memory/index.js';

// Execute Code Tool (Story 6.2)
export {
  registerOrionSandboxTool,
  setOrionSandboxContext,
  clearOrionSandboxContext,
  EXECUTE_CODE_TOOL_NAME,
} from './orion-sandbox/index.js';
