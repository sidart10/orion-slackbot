/**
 * Dynamic status messages (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

export function buildLoadingMessages(params?: {
  toolName?: string | null;
}): string[] {
  const base = [
    'Gathering context…',
    'Thinking…',
    'Checking results…',
    'Preparing response…',
  ];

  const toolName = params?.toolName?.toLowerCase() ?? '';

  const toolSpecific: Record<string, string> = {
    mcp_call: 'Calling tools…',
    memory: 'Checking memory…',
    web_search: 'Searching the web…',
  };

  const toolMsg = toolSpecific[toolName];
  if (!toolMsg) return base;

  // Put tool-specific message first for best UX.
  return [toolMsg, ...base.filter((m) => m !== toolMsg)];
}


