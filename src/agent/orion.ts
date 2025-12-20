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
import { getToolConfig } from './tools.js';
import { getPrompt, type LangfuseTrace } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import { startActiveObservation } from '../observability/tracing.js';
import { buildCitationRegistry, formatCitationFooter } from './citations.js';

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

  const toolConfig = getToolConfig();

  logger.info({
    event: 'orion_agent_start',
    userId: options.context.userId,
    traceId: options.context.traceId,
    mcpServers: Object.keys(toolConfig.mcpServers),
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

  // Add source citations if available (Story 2.7 AC#1, AC#2)
  if (response.sources.length > 0) {
    const registry = buildCitationRegistry(response.sources);
    const citationFooter = formatCitationFooter(registry.citations);
    if (citationFooter) {
      yield citationFooter;
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
  // Wrap in Langfuse observation
  yield* await startActiveObservation({
    name: 'agent_direct_execution',
    userId: options.context.userId,
    sessionId: options.context.threadTs,
    input: userMessage,
    metadata: {
      channelId: options.context.channelId,
      traceId: options.context.traceId,
    }
  }, async (trace) => {
    const startTime = Date.now();
    const toolConfig = getToolConfig();

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
      mcpServers: Object.keys(toolConfig.mcpServers),
    });

    trace.update({
      metadata: {
        mcpServers: Object.keys(toolConfig.mcpServers),
        allowedTools: toolConfig.allowedTools,
      }
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

    // Stream responses - yield text and trace tools
    const chunks: string[] = [];
    let tokenCount = 0;
    let messageCount = 0;
    
    // We need to yield values from inside the callback
    // But this is an async function returning Promise, not Generator
    // So we need to consume the generator here and buffer/yield?
    // Wait, runOrionAgentDirect is a Generator.
    // startActiveObservation returns Promise<T>.
    // If T is AsyncGenerator, we can yield* it.
    
    // So we return the generator from this callback
    return (async function* () {
        for await (const message of response as AsyncIterable<SDKMessage>) {
            if (message.type === 'text' && typeof message.content === 'string') {
              tokenCount += estimateTokens(message.content);
              messageCount++;
              chunks.push(message.content);
              yield message.content;
            } else if (message.type === 'tool_use' || message.type === 'tool_result') {
                // Trace tool execution events
                // Note: Actual detailed tracing of tool duration might require SDK hooks or more complex event handling
                // For now, we log the event as part of the trace
                logger.info({
                    event: message.type,
                    content: message.content,
                    traceId: options.context.traceId
                });
                
                // Add tool event to trace metadata or logs
                // trace.event({ ... }) if supported, or just update metadata
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
        
        // Update trace with output
        trace.update({
            output: {
                fullResponse: chunks.join(''),
                tokenCount,
                messageCount,
                duration
            }
        });
    })();
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
