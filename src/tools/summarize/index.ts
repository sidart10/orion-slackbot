/**
 * Summarize Tool Module
 *
 * Exports the summarize tool for registration and the context helpers
 * for runtime execution.
 *
 * @see Story 7.6 - Conversation Summarization
 */

// Tool registration
export {
  registerSummarizeTool,
  setSummarizeToolContext,
  clearSummarizeToolContext,
  SUMMARIZE_TOOL_NAME,
  summarizeToolDefinition,
  type SummarizeToolInput,
  type SummarizeToolContext,
} from './tool.js';

// Core summarize function (for direct use if needed)
export { summarize } from './summarize.js';
export { summarizeThread } from './summarize-thread.js';
export { summarizeConversation } from './summarize-conversation.js';

// Types
export type { SummaryResult, SummarizeParams } from './summarize-types.js';

// Formatting
export { formatSummaryResponse } from './format-summary.js';

