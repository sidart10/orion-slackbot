/**
 * Orion Agent Core Module
 *
 * Integrates with Claude Agent SDK to process user messages and stream responses.
 * Uses the canonical agent loop pattern: Gather → Act → Verify
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#1 - Message passed to Claude Agent SDK via query()
 * @see AC#3 - Response streamed back to Slack
 * @see AC#5 - Response time 1-3 seconds (NFR1)
 * @see AR7 - All agent implementations MUST follow the canonical agent loop pattern
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadAgentPrompt } from './loader.js';
import { executeAgentLoop, type AgentContext as LoopAgentContext } from './loop.js';
import { toolConfig } from './tools.js';
import { getPrompt, type LangfuseTrace } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';

/**
 * Context for agent execution within a Slack thread
 */
export interface AgentContext {
  /** Previous messages in the thread formatted as strings */
  threadHistory: string[];
  /** Slack user ID */
  userId: string;
  /** Slack channel ID */
  channelId: string;
  /** Thread timestamp */
  threadTs?: string;
  /** Langfuse trace ID for observability */
  traceId?: string;
}

/**
 * Options for running the Orion agent
 */
export interface AgentOptions {
  /** Thread and user context */
  context: AgentContext;
  /** Override the default system prompt */
  systemPromptOverride?: string;
  /** Parent Langfuse trace for observability (Story 2.2) */
  parentTrace?: LangfuseTrace;
}

/** Message type from Claude Agent SDK */
interface SDKMessage {
  type: string;
  content: unknown;
}

/**
 * Create a no-op trace for when parentTrace is not provided
 */
function createNoOpTrace(): LangfuseTrace {
  return {
    id: 'noop-trace-id',
    update: (): void => {},
    span: () => ({ end: (): void => {} }),
    generation: (): void => {},
  };
}

/**
 * Run the Orion agent with a user message using the canonical agent loop
 *
 * @param userMessage - The user's message text
 * @param options - Agent context and configuration
 * @returns AsyncGenerator yielding response text chunks
 *
 * @example
 * const chunks: string[] = [];
 * for await (const chunk of runOrionAgent('Hello', { context, parentTrace })) {
 *   chunks.push(chunk);
 * }
 * const fullResponse = chunks.join('');
 */
export async function* runOrionAgent(
  userMessage: string,
  options: AgentOptions
): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now();
  const parentTrace = options.parentTrace ?? createNoOpTrace();

  logger.info({
    event: 'orion_agent_start',
    userId: options.context.userId,
    traceId: options.context.traceId,
  });

  // Convert context to loop format
  const loopContext: LoopAgentContext = {
    userId: options.context.userId,
    channelId: options.context.channelId,
    threadTs: options.context.threadTs ?? Date.now().toString(),
    threadHistory: options.context.threadHistory,
    traceId: options.context.traceId,
  };

  // Execute the agent loop (AR7: canonical pattern)
  const response = await executeAgentLoop(
    userMessage,
    loopContext,
    parentTrace
  );

  // Stream the response content
  // For now, yield the entire response
  // Chunked streaming will be enhanced when Claude SDK is fully integrated
  yield response.content;

  // Add source citations if available
  if (response.sources.length > 0) {
    yield '\n\n_Sources:_\n';
    for (const source of response.sources) {
      yield `• ${source.reference}\n`;
    }
  }

  const duration = Date.now() - startTime;
  logger.info({
    event: 'orion_agent_complete',
    userId: options.context.userId,
    duration,
    verified: response.verified,
    attemptCount: response.attemptCount,
    traceId: options.context.traceId,
  });
}

/**
 * Run the Orion agent with direct Claude SDK access (legacy mode)
 *
 * Use this for direct SDK streaming without the agent loop.
 * Prefer runOrionAgent for production use.
 *
 * @param userMessage - The user's message text
 * @param options - Agent context and configuration
 * @returns AsyncGenerator yielding response text chunks
 */
export async function* runOrionAgentDirect(
  userMessage: string,
  options: AgentOptions
): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now();

  // Load system prompt (Langfuse first, fallback to local)
  let systemPrompt: string;
  try {
    const promptObj = await getPrompt('orion-system-prompt');
    // Langfuse prompt objects have a compile method
    if (promptObj && typeof promptObj === 'object' && 'compile' in promptObj) {
      systemPrompt = (
        promptObj as { compile: (vars: Record<string, unknown>) => string }
      ).compile({
        threadHistory: options.context.threadHistory.join('\n'),
      });
    } else {
      throw new Error('Invalid prompt object');
    }
  } catch (error) {
    logger.warn({
      event: 'langfuse_prompt_fallback',
      error: error instanceof Error ? error.message : String(error),
      traceId: options.context.traceId,
    });
    systemPrompt = await loadAgentPrompt('orion');
  }

  // Override if provided
  if (options.systemPromptOverride) {
    systemPrompt = options.systemPromptOverride;
  }

  logger.info({
    event: 'agent_start',
    userId: options.context.userId,
    promptLength: systemPrompt.length,
    traceId: options.context.traceId,
  });

  // Execute agent query
  const response = query({
    prompt: userMessage,
    options: {
      systemPrompt,
      mcpServers: toolConfig.mcpServers,
      settingSources: ['user', 'project'] as const,
      allowedTools: toolConfig.allowedTools,
      cwd: process.cwd(),
    },
  });

  // Stream responses - only yield text content
  let tokenCount = 0;
  let messageCount = 0;
  for await (const message of response as AsyncIterable<SDKMessage>) {
    if (message.type === 'text' && typeof message.content === 'string') {
      tokenCount += estimateTokens(message.content);
      messageCount++;
      yield message.content;
    }
  }

  // M1: Log warning if no messages were yielded (empty response)
  if (messageCount === 0) {
    logger.warn({
      event: 'agent_empty_response',
      userId: options.context.userId,
      traceId: options.context.traceId,
      hint: 'Agent returned no text messages - check if prompt is valid',
    });
  }

  const duration = Date.now() - startTime;
  logger.info({
    event: 'agent_complete',
    userId: options.context.userId,
    duration,
    tokenCount,
    messageCount,
    traceId: options.context.traceId,
    nfr1Met: duration < 3000,
  });
}

/**
 * Rough token estimate for logging
 * Uses ~4 chars per token as approximation
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
