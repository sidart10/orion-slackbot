/**
 * Summarize Tool Definition and Handler
 *
 * Registers the summarize_conversation tool with the agent.
 * This tool allows Claude to summarize Slack conversations, threads,
 * channels, group DMs, and direct messages.
 *
 * @see Story 7.6 - Conversation Summarization
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { WebClient } from '@slack/web-api';
import type { ToolResult } from '../../utils/tool-result.js';
import { toolRegistry } from '../registry.js';
import { summarize } from './summarize.js';
import { formatSummaryResponse } from './format-summary.js';
import type { SummaryResult } from './summarize-types.js';
import { logger } from '../../utils/logger.js';

/**
 * Tool name as exposed to Claude.
 */
export const SUMMARIZE_TOOL_NAME = 'summarize_conversation';

/**
 * Tool definition for Claude's tool_use capability.
 *
 * NOTE: Channel/thread context is injected by the handler via setSummarizeToolContext.
 * Claude only needs to pass the user's message - we get the rest from context.
 */
export const summarizeToolDefinition: Anthropic.Tool = {
  name: SUMMARIZE_TOOL_NAME,
  description: `Summarize ALL messages in a Slack channel, thread, or DM over a time period.

USE THIS TOOL WHEN:
- "Summarize this channel" / "summarize #general"
- "TLDR" / "summarize this thread"
- "What happened today?" / "catch me up on the past week"
- User provides a thread URL to summarize

DO NOT USE THIS TOOL FOR:
- "Find me the thread about X" — this tool cannot search for threads
- "Where did we discuss X?" — this tool cannot search for topics
- Searching or finding specific messages — use conversation history directly

This tool summarizes ALL messages in a conversation. It does not search or find specific threads.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      user_request: {
        type: 'string',
        description:
          'The user\'s summarization request (e.g., "summarize this channel", "tldr", "what happened in the past week?")',
      },
    },
    required: ['user_request'],
  },
};

/**
 * Input type for the summarize tool handler.
 * Claude only provides the user_request - context comes from setSummarizeToolContext.
 */
export interface SummarizeToolInput {
  user_request: string;
}

/**
 * Execution context passed to the tool handler.
 * The Slack client and channel context must be injected at runtime.
 */
export interface SummarizeToolContext {
  client: WebClient;
  traceId: string;
  /** Current channel ID where the user made the request */
  channelId: string;
  /** Thread timestamp if user is in a thread */
  threadTs?: string;
  /** Message timestamp of the user's message */
  messageTs: string;
}

// Module-level context storage for the current request
let currentContext: SummarizeToolContext | null = null;

/**
 * Set the execution context for the summarize tool.
 * Must be called before tool execution with the current request's Slack client.
 *
 * @param context - The execution context with Slack client and trace ID
 */
export function setSummarizeToolContext(context: SummarizeToolContext): void {
  currentContext = context;
}

/**
 * Clear the execution context after request completion.
 */
export function clearSummarizeToolContext(): void {
  currentContext = null;
}

/**
 * Tool handler for summarize_conversation.
 * Called by the tool router when Claude invokes the tool.
 *
 * Context (channel, thread, client) is injected via setSummarizeToolContext.
 * Claude only provides the user's request text.
 *
 * @param input - Tool input from Claude (just user_request)
 * @returns Formatted summary string or error message
 */
export async function handleSummarizeTool(
  input: unknown
): Promise<string> {
  const typedInput = input as SummarizeToolInput;

  if (!currentContext) {
    logger.error({
      event: 'summarize_tool.context_missing',
      message: 'Summarize tool called without execution context',
    });
    return 'Error: Unable to summarize - missing Slack client context. This is an internal error.';
  }

  const { client, traceId, channelId, threadTs, messageTs } = currentContext;

  logger.info({
    event: 'summarize_tool.invoked',
    channelId,
    hasThreadTs: !!threadTs,
    userRequest: typedInput.user_request,
    traceId,
  });

  const result: ToolResult<SummaryResult> = await summarize({
    userMessage: typedInput.user_request,
    currentChannelId: channelId,
    currentThreadTs: threadTs,
    messageTs,
    client,
    traceId,
  });

  if (!result.success) {
    logger.warn({
      event: 'summarize_tool.failed',
      error: result.error.message,
      code: result.error.code,
      traceId,
    });
    return result.error.message;
  }

  const formatted = formatSummaryResponse(result.data);

  logger.info({
    event: 'summarize_tool.success',
    messageCount: result.data.messageCount,
    type: result.data.type,
    sourceUrl: result.data.sourceUrl,
    traceId,
  });

  // Return structured object with optional single source link
  // NOTE: Summarization does NOT return multiple "sources" — the messages ARE the input.
  // We provide a single link so users can jump to the conversation/thread.
  const response: {
    summary: string;
    url?: string;
    title?: string;
  } = {
    summary: formatted,
  };

  // Single link to the conversation/thread (NOT multiple "sources")
  if (result.data.sourceUrl) {
    response.url = result.data.sourceUrl;
    response.title = result.data.type === 'thread' ? 'View thread' : 'View conversation';
  }

  return JSON.stringify(response);
}

/**
 * Register the summarize tool with the tool registry.
 * Call this during application initialization.
 */
export function registerSummarizeTool(): void {
  toolRegistry.registerStaticTool(
    SUMMARIZE_TOOL_NAME,
    handleSummarizeTool,
    summarizeToolDefinition
  );

  logger.info({
    event: 'summarize_tool.registered',
    toolName: SUMMARIZE_TOOL_NAME,
  });
}

