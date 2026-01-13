/**
 * Tool Summary Formatter for Consistent Status Messages.
 *
 * Provides standardized formatting for tool status messages displayed to users
 * during agent execution.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#3 - Consistent Tool Summary Format
 */

/**
 * Supported tool action types.
 *
 * Each action maps to a user-friendly verb for display.
 */
export type ToolAction =
  | 'search'
  | 'call'
  | 'execute'
  | 'analyze'
  | 'generate'
  | 'fetch'
  | 'run';

/**
 * Action verbs for tool status messages.
 *
 * @see Story 8.5 AC#3 - Standardized format
 */
const ACTION_VERBS: Record<ToolAction, string> = {
  search: 'Searching',
  call: 'Calling',
  execute: 'Executing',
  analyze: 'Analyzing',
  generate: 'Generating',
  fetch: 'Fetching',
  run: 'Running',
};

/**
 * Parameters for formatting a tool summary.
 */
export interface ToolSummaryParams {
  /** Display name of the tool */
  toolName: string;
  /** Type of action being performed */
  action: ToolAction;
  /** Optional context (query, ID, filename, etc.) */
  context?: string;
  /** Maximum length for context before truncation (default: 40) */
  maxContextLength?: number;
}

/** Default maximum context length before truncation */
const DEFAULT_MAX_CONTEXT_LENGTH = 40;

/**
 * Truncate a string with ellipsis if it exceeds the max length.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
function truncateWithEllipsis(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Get the action verb for a given action type.
 *
 * Returns the action as-is if not found in the mapping (graceful fallback).
 *
 * @param action - Tool action type
 * @returns User-friendly verb (e.g., 'Searching', 'Calling')
 */
export function getActionVerb(action: ToolAction | string): string {
  // Check if it's a known action
  if (action in ACTION_VERBS) {
    return ACTION_VERBS[action as ToolAction];
  }

  // Unknown action: capitalize first letter as fallback
  if (typeof action === 'string' && action.length > 0) {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  return 'Using';
}

/**
 * Format a tool summary for user-facing status messages.
 *
 * Produces standardized status messages in the format:
 * - With context: `{Action} {Tool Name} - "{context}"`
 * - Without context: `{Action} {Tool Name}`
 *
 * @param params - Tool summary parameters
 * @returns Formatted status message string
 *
 * @see Story 8.5 AC#3 - Consistent tool summary format
 *
 * @example
 * formatToolSummary({ toolName: 'MSCI Reports', action: 'search', context: 'Hulu Q3 revenue' })
 * // => 'Searching MSCI Reports - "Hulu Q3 revenue"'
 *
 * formatToolSummary({ toolName: 'Audience Manager', action: 'call', context: 'segment ID 12345' })
 * // => 'Calling Audience Manager - "segment ID 12345"'
 *
 * formatToolSummary({ toolName: 'code', action: 'execute', context: 'generating Excel report' })
 * // => 'Executing code - "generating Excel report"'
 *
 * formatToolSummary({ toolName: 'Confluence', action: 'search' })
 * // => 'Searching Confluence'
 */
export function formatToolSummary(params: ToolSummaryParams): string {
  const { toolName, action, context, maxContextLength = DEFAULT_MAX_CONTEXT_LENGTH } = params;

  const verb = getActionVerb(action);

  // No context or empty context: simple format
  if (!context || context.trim() === '') {
    return `${verb} ${toolName}`;
  }

  // Truncate context if needed
  const truncatedContext = truncateWithEllipsis(context.trim(), maxContextLength);

  // Format with context in quotes
  return `${verb} ${toolName} - "${truncatedContext}"`;
}

/**
 * Infer the action type from a tool name.
 *
 * Provides a best-guess action type based on common tool naming patterns.
 *
 * @param toolName - Name of the tool
 * @returns Inferred action type
 *
 * @example
 * inferActionFromToolName('search_reports')  // => 'search'
 * inferActionFromToolName('get_user_data')   // => 'fetch'
 * inferActionFromToolName('generate_report') // => 'generate'
 */
export function inferActionFromToolName(toolName: string): ToolAction {
  const nameLower = toolName.toLowerCase();

  if (nameLower.includes('search') || nameLower.includes('query') || nameLower.includes('find')) {
    return 'search';
  }

  if (nameLower.includes('get') || nameLower.includes('fetch') || nameLower.includes('retrieve') || nameLower.includes('list')) {
    return 'fetch';
  }

  if (nameLower.includes('generate') || nameLower.includes('create') || nameLower.includes('build')) {
    return 'generate';
  }

  if (nameLower.includes('analyze') || nameLower.includes('process') || nameLower.includes('parse')) {
    return 'analyze';
  }

  if (nameLower.includes('execute') || nameLower.includes('run') || nameLower.includes('code')) {
    return 'execute';
  }

  // Default to 'call' for API-style tools
  return 'call';
}

/**
 * Format a tool name for display.
 *
 * Converts tool names to human-readable format:
 * - MCP tools: `server__tool` -> `Server: Tool`
 * - Snake case: `search_reports` -> `Search Reports`
 * - Kebab case: `search-reports` -> `Search Reports`
 *
 * @param toolName - Raw tool name
 * @returns Human-readable tool name
 *
 * @example
 * formatToolName('msci-reports__search_reports')  // => 'Msci Reports: Search Reports'
 * formatToolName('search_user_data')              // => 'Search User Data'
 */
export function formatToolName(toolName: string): string {
  // MCP tools have format: serverName__toolName
  if (toolName.includes('__')) {
    const [server, tool] = toolName.split('__', 2);
    const formatPart = (s: string): string =>
      s
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${formatPart(server ?? '')}: ${formatPart(tool ?? '')}`;
  }

  // Standard tool: just format nicely
  return toolName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
