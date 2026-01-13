/**
 * Dynamic status messages (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 7.3 - Contextual Tool Feedback (AC1-AC5)
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup (AC3)
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

import { formatToolDisplayName, summarizeToolInput } from '../agent/loop.js';
import {
  formatToolSummary,
  inferActionFromToolName,
  formatToolName,
  type ToolAction,
} from '../tools/tool-summary.js';

/**
 * Parameters for building loading messages.
 *
 * @see Story 7.3 - Contextual Tool Feedback
 */
export interface LoadingMessageParams {
  /** Current agent phase (Story 7.3 AC5) */
  phase?: 'gather' | 'act' | 'tool' | 'verify' | 'final';
  /** Tool name (legacy or for single tool) */
  toolName?: string | null;
  /** Tool input for query extraction (Story 7.3 AC1) */
  toolInput?: Record<string, unknown>;
  /** All tools for parallel execution display (Story 7.3 AC4) */
  allTools?: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Build a single tool message with server name and query.
 *
 * Story 8.5 AC3: Uses standardized format: `{Action} {Tool Name} - "{context}"`
 *
 * @example
 * buildSingleToolMessage('msci-reports__search_reports', { query: 'Hulu' })
 * // => 'Searching Msci Reports: Search Reports - "Hulu"'
 */
function buildSingleToolMessage(
  toolName: string,
  input: Record<string, unknown> | undefined
): string {
  const displayName = formatToolDisplayName(toolName);
  const query = input ? summarizeToolInput(input) : '';
  const action = inferActionFromToolName(toolName);

  // Story 8.5 AC3: Use standardized formatToolSummary for consistent format
  return formatToolSummary({
    toolName: displayName,
    action,
    context: query || undefined,
    maxContextLength: 50, // Slightly longer for status messages
  });
}

/**
 * Build a multi-tool message for parallel execution.
 *
 * Story 8.5 AC3: Uses action verbs for multi-tool display.
 *
 * @example
 * buildMultiToolMessage([
 *   { name: 'rube__search', input: { query: 'SF restaurants' } },
 *   { name: 'google__calendar', input: {} }
 * ])
 * // => 'Searching + Fetching Calendar...'
 */
function buildMultiToolMessage(
  tools: Array<{ name: string; input: Record<string, unknown> }>
): string {
  const actions = tools.map((t) => {
    const displayName = formatToolDisplayName(t.name);
    const query = summarizeToolInput(t.input);
    const action = inferActionFromToolName(t.name);

    // Extract just the action/tool part for multi-tool display
    const actionPart = displayName.includes(':')
      ? displayName.split(':')[1]?.trim() ?? displayName
      : displayName;

    // Truncate query for multi-tool display
    if (query) {
      const shortQuery = query.length > 25 ? `${query.slice(0, 22)}...` : query;
      return `${actionPart} "${shortQuery}"`;
    }
    return actionPart;
  });

  return `${actions.join(' + ')}...`;
}

/**
 * Build loading messages based on agent phase and tool context.
 *
 * Story 7.3: Enhanced status messages with:
 * - AC1: Tool name + query display ("Using MSCI Reports: Search — 'Hulu'…")
 * - AC4: Multi-tool parallel display ("Search + Calendar + …")
 * - AC5: Phase-based messages (gather/act/verify/final)
 *
 * @param params - Loading message parameters
 * @returns Array of status messages (typically 1 element)
 *
 * @example
 * // Phase-based
 * buildLoadingMessages({ phase: 'gather' }) // => ['Gathering context…']
 *
 * // Single tool with query
 * buildLoadingMessages({
 *   phase: 'tool',
 *   toolName: 'msci-reports__search',
 *   toolInput: { query: 'Hulu' }
 * }) // => ['Using Msci Reports: Search — "Hulu"…']
 *
 * // Multi-tool parallel
 * buildLoadingMessages({
 *   phase: 'tool',
 *   allTools: [{ name: 'search', input: {} }, { name: 'calendar', input: {} }]
 * }) // => ['Search + Calendar…']
 */
export function buildLoadingMessages(params?: LoadingMessageParams): string[] {
  const { phase, toolName, toolInput, allTools } = params ?? {};

  // Story 7.3 AC5: Phase-specific messages
  if (phase === 'gather') {
    return ['Gathering context…'];
  }

  if (phase === 'act') {
    return ['Working on your request…'];
  }

  if (phase === 'verify') {
    return ['Checking results…'];
  }

  if (phase === 'final') {
    // No message for final phase (response streaming)
    return [];
  }

  // Tool phase: build contextual tool message
  if (phase === 'tool') {
    // Story 6.3 AC9 + Story 8.5 AC3: PTC-specific status message with standardized format
    if (toolName === 'code_execution') {
      // Check if a skill name was detected from the Python code
      const skillName = typeof toolInput === 'object' && toolInput !== null && 'skillName' in toolInput
        ? (toolInput as { skillName?: string }).skillName
        : undefined;

      if (skillName) {
        // Show skill name when detected (e.g., "Running skill: samba-slides")
        return [formatToolSummary({
          toolName: skillName,
          action: 'run',
          context: 'skill',
        })];
      }

      // Fallback for generic code execution
      return [formatToolSummary({
        toolName: 'code',
        action: 'execute',
        context: 'running analysis',
      })];
    }

    // Story 8.2: Tool Search status message - show when discovering deferred tools
    if (toolName === 'tool_search') {
      // Extract search query from input if available
      const query = typeof toolInput === 'object' && toolInput !== null && 'query' in toolInput
        ? String((toolInput as { query?: string }).query)
        : undefined;
      return [formatToolSummary({
        toolName: 'tools',
        action: 'search',
        context: query ? query.slice(0, 50) : 'discovering capabilities',
      })];
    }

    // Story 7.3 AC4: Multi-tool parallel display
    if (allTools && allTools.length > 1) {
      return [buildMultiToolMessage(allTools)];
    }

    // Story 7.3 AC1: Single tool with context
    if (toolName) {
      return [buildSingleToolMessage(toolName, toolInput)];
    }

    // Fallback for tool phase without tool info
    return ['Calling tools…'];
  }

  // No phase specified: fallback to generic message (backwards compatibility)
  if (toolName) {
    return ['Working on your request…'];
  }

  // Default rotating list (legacy behavior)
  return [
    'Gathering context…',
    'Thinking…',
    'Checking results…',
    'Preparing response…',
  ];
}
