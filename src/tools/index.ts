/**
 * Tools Module
 *
 * Provides tool context generation and MCP integration.
 * Claude Agent SDK handles tool discovery and registry natively.
 *
 * NOTE (2025-12-18): Registry exports removed after course correction.
 * SDK handles tool caching internally — no custom registry needed.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 */

// Context (simplified - SDK handles discovery)
export {
  getToolContextSummary,
  getToolDetails,
  searchTools,
  ESSENTIAL_TOOL_PATTERNS,
  type ToolSchema,
} from './context.js';

// MCP
export * from './mcp/index.js';
