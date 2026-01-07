/**
 * Dynamic status messages (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 7.3 - Contextual Tool Feedback (AC1-AC5)
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

import { formatToolDisplayName, summarizeToolInput } from '../agent/loop.js';

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
 * @example
 * buildSingleToolMessage('msci-reports__search_reports', { query: 'Hulu' })
 * // => 'Using Msci Reports: Search Reports — "Hulu"…'
 */
function buildSingleToolMessage(
  toolName: string,
  input: Record<string, unknown> | undefined
): string {
  const displayName = formatToolDisplayName(toolName);
  const query = input ? summarizeToolInput(input) : '';

  if (query) {
    return `Using ${displayName} — "${query}"…`;
  }
  return `Using ${displayName}…`;
}

/**
 * Build a multi-tool message for parallel execution.
 *
 * @example
 * buildMultiToolMessage([
 *   { name: 'rube__search', input: { query: 'SF restaurants' } },
 *   { name: 'google__calendar', input: {} }
 * ])
 * // => 'Search "SF restaurants" + Calendar…'
 */
function buildMultiToolMessage(
  tools: Array<{ name: string; input: Record<string, unknown> }>
): string {
  const actions = tools.map((t) => {
    const displayName = formatToolDisplayName(t.name);
    const query = summarizeToolInput(t.input);

    // Extract just the action part for multi-tool display (Server: Action → Action)
    const actionPart = displayName.includes(':')
      ? displayName.split(':')[1]?.trim() ?? displayName
      : displayName;

    // Truncate query for multi-tool display
    if (query) {
      const shortQuery = query.length > 30 ? `${query.slice(0, 27)}…` : query;
      return `${actionPart} "${shortQuery}"`;
    }
    return actionPart;
  });

  return `${actions.join(' + ')}…`;
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
    // Story 6.3 AC9: PTC-specific status message
    if (toolName === 'code_execution') {
      return ['Running multi-tool analysis…'];
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
