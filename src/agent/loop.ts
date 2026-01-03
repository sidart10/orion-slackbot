/**
 * Canonical agent loop implementation (Story 2.2, 2.3).
 *
 * Phases:
 * - gather: collect relevant thread + local context
 * - act: call Anthropic streaming API and iterate tool_use until completion
 * - verify: produce structured verification result with retry mechanics (Story 2.3)
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#1 - Gather → Act → Verify
 * @see AC#2 - Direct Anthropic messages.create({ stream: true }) + bounded tool loop
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { getToolDefinitions, refreshMcpTools } from './tools.js';
import type { AgentContext, AgentResult } from './orion.js';
import { gatherContext, type ContextSource } from './gather.js';
import { verify } from './verify.js';
import {
  verifyResponse,
  createGracefulFailureResponse,
  buildRetryPrompt,
  MAX_VERIFICATION_ATTEMPTS,
  type VerificationContext,
  type VerificationResult,
} from './verification.js';
import type { NewLangfuseSpan } from '../observability/tracing.js';
import { type LangfuseTrace, getLangfuse } from '../observability/langfuse.js';

// Union type for trace - accepts both legacy and new SDK types
type TraceType = LangfuseTrace | NewLangfuseSpan;

// Helper to create a span that works with both trace types
function createAgentSpan(
  trace: TraceType | undefined,
  name: string,
  input?: Record<string, unknown>
): { end: (output?: Record<string, unknown>) => void } | null {
  if (!trace) return null;

  // Check if it's the new SDK type (has startObservation method)
  if ('startObservation' in trace && typeof trace.startObservation === 'function') {
    const span = trace.startObservation(name, { input });
    return {
      end: (output?: Record<string, unknown>): void => {
        if (output) span.update({ output });
        span.end();
      },
    };
  }

  // Legacy LangfuseTrace type
  if ('span' in trace && typeof trace.span === 'function') {
    const span = trace.span({ name, input });
    return {
      end: (output?: Record<string, unknown>): void => {
        span.end(output);
      },
    };
  }

  return null;
}

export interface AgentLoopResult extends AgentResult {
  sources: ContextSource[];
  verification: VerificationResult;
  toolCount: number;
  /** Number of verification attempts made (Story 2.3) */
  verificationAttempts: number;
  /** Whether graceful failure was returned after exhausting attempts (Story 2.3) */
  gracefulFailure: boolean;
}

export interface AgentLoopOptions {
  context: AgentContext;
  systemPrompt: string;
  /** Langfuse trace for phase-level spans (agent.gather/act/verify). Accepts both legacy and new SDK types. */
  trace?: TraceType;
  /**
   * Optional status updater hook.
   * The Slack handler can provide an implementation that calls `setStatus({ status, loading_messages })`.
   *
   * @see Story 7.3 - Contextual Tool Feedback (AC1-AC5)
   */
  setStatus?: (params: {
    phase: 'gather' | 'act' | 'tool' | 'verify' | 'final';
    toolName?: string | null;
    /** Tool input for query extraction (Story 7.3 AC1) */
    toolInput?: Record<string, unknown>;
    /** All tools when parallel execution (Story 7.3 AC4) */
    allTools?: Array<{ name: string; input: Record<string, unknown> }>;
  }) => void | Promise<void>;
  /**
   * Optional tool executor. If omitted, tool calls return TOOL_NOT_IMPLEMENTED.
   * (Tool execution is expanded in Epic 3.)
   */
  executeTool?: (params: {
    name: string;
    toolUseId: string;
    input: unknown;
    traceId?: string;
  }) => Promise<unknown>;
  /** Override the max tool loop count (default 10) */
  maxToolLoops?: number;
}

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var automatically)
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

const DEFAULT_MAX_TOOL_LOOPS = 10;

/**
 * Format tool name for display.
 * "msci-reports__search_reports" -> "MSCI Reports: Search Reports"
 * "local_tool" -> "Local Tool"
 *
 * @see Story 7.3 - Contextual Tool Feedback (exported for status-messages.ts)
 */
export function formatToolDisplayName(toolName: string): string {
  // MCP tools have format: serverName__toolName
  if (toolName.includes('__')) {
    const [server, tool] = toolName.split('__', 2);
    const formatPart = (s: string): string =>
      s
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${formatPart(server ?? '')}: ${formatPart(tool ?? '')}`;
  }
  // Static tools: just format nicely
  return toolName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Summarize tool input for source context display.
 * Extracts the most relevant parameter (e.g., query, search term, name).
 *
 * @see Story 7.3 - Contextual Tool Feedback (exported for status-messages.ts)
 */
export function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  
  const obj = input as Record<string, unknown>;
  
  // Common search/query parameters to look for
  const queryKeys = ['query', 'search_query', 'search', 'name', 'term', 'q', 'keyword', 'filter'];
  
  for (const key of queryKeys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) {
      const summary = val.trim().slice(0, 60);
      return summary.length < val.trim().length ? `${summary}…` : summary;
    }
  }
  
  // Fallback: stringify first string value found
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && val.trim()) {
      const summary = val.trim().slice(0, 40);
      return summary.length < val.trim().length ? `${summary}…` : summary;
    }
  }
  
  return '';
}

/**
 * Extract URLs from markdown-formatted text.
 * Handles patterns like: [Chatbot Arena](https://lmarena.ai)
 *
 * Exported for testing (Story: Source Citations v2).
 */
export function extractMarkdownLinks(text: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  // Use matchAll for thread-safe, stateless regex matching
  const matches = text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g);
  for (const match of matches) {
    if (match[1] && match[2]) {
      links.push({ title: match[1], url: match[2] });
    }
  }
  return links;
}

/**
 * Extract URL sources from tool results.
 * Looks for common patterns in web search, MCP, and other tool responses.
 * Also extracts markdown-formatted links from text content (e.g., Exa search results).
 */
function extractUrlSourcesFromResult(
  toolName: string,
  result: unknown
): ContextSource[] {
  const sources: ContextSource[] = [];
  if (!result) return sources;

  // Parse stringified JSON if needed
  let data = result;
  if (typeof result === 'string') {
    try {
      data = JSON.parse(result);
    } catch {
      // Not JSON - check if it contains markdown links directly
      const mdLinks = extractMarkdownLinks(result);
      for (const link of mdLinks) {
        sources.push({
          type: 'tool',
          title: link.title.slice(0, 80),
          reference: toolName,
          url: link.url,
        });
      }
      return sources.slice(0, 50);
    }
  }

  // After parsing, check if we have an object to search
  if (typeof data !== 'object' || data === null) return sources;

  // Recursively find objects with url/title patterns
  const seen = new Set<string>();
  const extract = (obj: unknown, depth = 0): void => {
    if (depth > 5 || !obj || typeof obj !== 'object') return;
    
    // Check if this object looks like a source (has url and title/name)
    const o = obj as Record<string, unknown>;
    const url = o.url ?? o.link ?? o.href;
    const title = o.title ?? o.name ?? o.headline ?? o.description;
    
    if (typeof url === 'string' && url.startsWith('http') && !seen.has(url)) {
      seen.add(url);
      sources.push({
        type: 'tool',
        title: typeof title === 'string' ? title.slice(0, 80) : new URL(url).hostname,
        reference: toolName,
        url,
      });
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) extract(item, depth + 1);
    } else {
      for (const val of Object.values(o)) extract(val, depth + 1);
    }
  };

  extract(data);

  // Also extract markdown links from text content blocks (e.g., MCP responses)
  const extractTextContent = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    const o = obj as Record<string, unknown>;
    
    // Check for MCP content blocks: { type: 'text', text: '...' }
    if (o.type === 'text' && typeof o.text === 'string') {
      const mdLinks = extractMarkdownLinks(o.text);
      for (const link of mdLinks) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          sources.push({
            type: 'tool',
            title: link.title.slice(0, 80),
            reference: toolName,
            url: link.url,
          });
        }
      }
    }
    
    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) extractTextContent(item);
    } else {
      for (const val of Object.values(o)) extractTextContent(val);
    }
  };
  
  extractTextContent(data);

  return sources.slice(0, 50); // Cap at 50 sources per tool (increased for web search)
}

/**
 * Story 2.9: Maximum buffer size for streaming tool input accumulation.
 * Prevents memory exhaustion from extremely large tool inputs.
 */
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB limit per tool input

/**
 * Story 2.9: Tool use with index tracking for streaming accumulation.
 * The _index correlates with content_block events for proper accumulation.
 * The _skipExecution flag marks tools that should be skipped due to parse errors.
 */
type StreamingToolUse = {
  id: string;
  name: string;
  input: unknown;
  _index: number;
  _skipExecution?: boolean;
};

/**
 * Execute the canonical agent loop and stream text deltas to the caller.
 *
 * NOTE: This function currently keeps gather/verify minimal; later tasks in Story 2.2
 * enrich those phases and add Langfuse spans + dynamic status updates.
 */
export async function* executeAgentLoop(
  userMessage: string,
  options: AgentLoopOptions
): AsyncGenerator<string, AgentLoopResult, undefined> {
  /**
   * Chunk verified output for Slack streaming.
   *
   * Why: In practice, yielding a single large string causes the Slack chatStream UI
   * to show "stream started", then effectively render the full response at once.
   * Chunking forces multiple debounced updates (Story 1.5).
   */
  const chunkVerifiedOutput = (text: string): string[] => {
    const MAX_CHARS = 400;
    if (text.length <= MAX_CHARS) return [text];

    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + MAX_CHARS, text.length);
      let cut = end;

      // Prefer cutting on whitespace so we don't split mid-word.
      for (let j = end; j > i; j--) {
        if (/\s/.test(text[j - 1] ?? '')) {
          cut = j;
          break;
        }
      }

      if (cut === i) cut = end;
      chunks.push(text.slice(i, cut));
      i = cut;
    }
    return chunks;
  };

  const startTime = Date.now();
  const { context, systemPrompt } = options;
  const trace = options.trace;

  logger.info({
    event: 'agent.loop.start',
    userId: context.userId,
    channelId: context.channelId,
    traceId: context.traceId,
    messageLength: userMessage.length,
  });

  // Story 3.2: best-effort MCP discovery + registry refresh (lazy + TTL).
  const refresh = await refreshMcpTools(context.traceId);
  if (!refresh.success) {
    logger.warn({
      event: 'tools.discovery.failed',
      traceId: context.traceId,
      errorCode: refresh.error.code,
      errorMessage: refresh.error.message,
    });
  }

  const tools = getToolDefinitions();
  void options.setStatus?.({ phase: 'gather' });
  const gatherSpan = createAgentSpan(trace, 'agent.gather', {
    messageLength: userMessage.length,
    historyLength: context.threadHistory.length,
  });

  const { contextText, sources } = await gatherContext({
    userMessage,
    threadHistory: context.threadHistory,
  });

  gatherSpan?.end({
    output: {
      contextLength: contextText.length,
      sourcesCount: sources.length,
      threadSourcesCount: sources.filter((s) => s.type === 'thread').length,
      fileSourcesCount: sources.filter((s) => s.type === 'file').length,
    },
  });

  const effectiveSystemPrompt =
    contextText.length > 0
      ? `${systemPrompt}\n\nContext:\n${contextText}`
      : systemPrompt;

  // Build messages array from thread history + current message.
  // gatherContext does NOT mutate messages; it only affects the system prompt for now.
  const messages: Anthropic.MessageParam[] = [
    ...context.threadHistory,
    { role: 'user', content: userMessage },
  ];

  const MAX_TOOL_LOOPS = options.maxToolLoops ?? DEFAULT_MAX_TOOL_LOOPS;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModel: string | undefined;
  let lastStopReason: string | null | undefined;
  let toolCount = 0;
  let maxToolLoopsReached = false;
  
  // Track tools called for source attribution
  const toolSourcesMap = new Map<string, ContextSource>();

  // Story 2.3: Verification retry state
  let verificationAttempts = 0;
  let verifiedResponse = '';
  let verification: VerificationResult = { passed: false, issues: [], feedback: '' };
  let gracefulFailure = false;
  const verificationContext: VerificationContext = {
    userMessage,
    hasSources: sources.length > 0,
  };

  // Clone messages for retry attempts (we may need to reset between attempts)
  const baseMessages = [...messages];

  // Story 2.3: Verification retry loop (AC#3 - max 3 attempts)
  for (
    verificationAttempts = 1;
    verificationAttempts <= MAX_VERIFICATION_ATTEMPTS;
    // Increment only if we'll retry (handled at end of loop body)
  ) {
    // Reset messages for this attempt (keep base + any retry feedback)
    const attemptMessages: Anthropic.MessageParam[] = [...baseMessages];

    // Add retry feedback from previous attempt if this is a retry
    if (verificationAttempts > 1 && verification.feedback) {
      const retryPrompt = buildRetryPrompt(
        verifiedResponse,
        verification.feedback,
        verificationAttempts
      );
      attemptMessages.push({ role: 'user', content: retryPrompt });
    }

    // Buffer for this attempt's response (AC#2 - unverified content never delivered)
    let attemptResponse = '';

    void options.setStatus?.({ phase: 'act' });
    const actSpan = createAgentSpan(trace, 'agent.act', {
      promptLength: effectiveSystemPrompt.length,
      toolsCount: tools.length,
      maxToolLoops: MAX_TOOL_LOOPS,
      verificationAttempt: verificationAttempts,
    });

    // Inner tool loop for this verification attempt
    for (let iteration = 0; iteration < MAX_TOOL_LOOPS; iteration++) {
      // Story 7.5 Fix: Reset attemptResponse for each LLM iteration.
      // Only the FINAL iteration's text (after all tools complete) should be delivered.
      // Previous iterations may output "thinking" text before tool_use that shouldn't be shown.
      const previousAttemptResponse = attemptResponse;
      attemptResponse = '';

      // Debug log for duplicate detection (Story 7.5)
      if (previousAttemptResponse.length > 0) {
        logger.debug({
          event: 'agent.loop.reset_attempt_response',
          iteration,
          previousLength: previousAttemptResponse.length,
          previousPreview: previousAttemptResponse.slice(0, 100),
          traceId: context.traceId,
        });
      }

      // Create a span for this LLM call (per-call visibility)
      const llmSpan = createAgentSpan(trace, `llm.anthropic.${iteration}`, {
        model: config.anthropicModel,
        iteration,
        messagesCount: attemptMessages.length,
      });

      const stream = (await anthropic.messages.create({
        model: config.anthropicModel,
        max_tokens: 8192,
        system: effectiveSystemPrompt,
        messages: attemptMessages,
        stream: true,
        ...(tools.length > 0 ? { tools } : {}),
        // Story 5.1 AC#7: Enable memory tool auto-context
        betas: ['context-management-2025-06-27'],
      } as unknown as Anthropic.MessageCreateParams)) as unknown as AsyncIterable<Anthropic.RawMessageStreamEvent>;

      let inputTokensThisCall = 0;
      let outputTokensThisCall = 0;
      let stopReasonThisCall: string | null | undefined;
      let modelThisCall: string | undefined;
      // Story 2.9: Use StreamingToolUse type with _index for accumulation correlation
      const toolUsesThisCall: StreamingToolUse[] = [];
      // Story 2.9: Buffer for accumulating streamed tool inputs (index → partial JSON)
      const toolInputBuffers = new Map<number, string>();

      for await (const event of stream) {
        if (event.type === 'message_start') {
          modelThisCall = event.message?.model;
          continue;
        }

        if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            // Story 2.9: Capture index for streaming accumulation correlation
            // M3 fix: Defensive type check for index field
            const rawIndex = (event as Record<string, unknown>).index;
            const blockIndex = typeof rawIndex === 'number' ? rawIndex : -1;
            toolUsesThisCall.push({
              id: event.content_block.id,
              name: event.content_block.name,
              input: event.content_block.input,
              _index: blockIndex,
            });
            // Initialize buffer for potential streamed input
            toolInputBuffers.set(blockIndex, '');
          }
          continue;
        }

        if (event.type === 'content_block_delta') {
          const deltaEvent = event as { index?: unknown; delta?: { type?: string; text?: string; partial_json?: string } };
          if (deltaEvent.delta?.type === 'text_delta') {
            const text = deltaEvent.delta.text ?? '';
            // Story 2.3: Buffer instead of yielding immediately (AC#2)
            attemptResponse += text;
          } else if (deltaEvent.delta?.type === 'input_json_delta') {
            // Story 2.9: Accumulate streamed tool input JSON
            // M3 fix: Defensive type check for index field
            const blockIndex = typeof deltaEvent.index === 'number' ? deltaEvent.index : -1;
            const partialJson = deltaEvent.delta.partial_json ?? '';
            const currentBuffer = toolInputBuffers.get(blockIndex) ?? '';
            const newBuffer = currentBuffer + partialJson;

            // Enforce buffer size limit (AC#6)
            if (newBuffer.length > MAX_BUFFER_SIZE) {
              logger.error({
                event: 'tool.input.too_large',
                index: blockIndex,
                bufferSize: newBuffer.length,
                traceId: context.traceId,
              });
              // Abandon accumulation - will fall back to initial input
              toolInputBuffers.delete(blockIndex);
            } else {
              toolInputBuffers.set(blockIndex, newBuffer);
            }
          }
          continue;
        }

        // Story 2.9: Handle content_block_stop to finalize accumulated input
        if (event.type === 'content_block_stop') {
          // M3 fix: Defensive type check for index field
          const rawIndex = (event as Record<string, unknown>).index;
          const blockIndex = typeof rawIndex === 'number' ? rawIndex : -1;
          const accumulated = toolInputBuffers.get(blockIndex);

          if (accumulated !== undefined && accumulated.length > 0) {
            const tool = toolUsesThisCall.find((t) => t._index === blockIndex);
            if (tool) {
              try {
                // Accumulated JSON takes precedence over initial input (Anthropic spec)
                tool.input = JSON.parse(accumulated);
                logger.info({
                  event: 'tool.input.accumulated',
                  toolName: tool.name,
                  bytes: accumulated.length,
                  success: true,
                  traceId: context.traceId,
                });
              } catch (e) {
                // AC#4: Log error and mark tool to be skipped
                logger.error({
                  event: 'tool.input.parse_failed',
                  index: blockIndex,
                  toolName: tool.name,
                  bytes: accumulated.length,
                  error: e instanceof Error ? e.message : String(e),
                  traceId: context.traceId,
                });
                tool._skipExecution = true;
              }
            }
            toolInputBuffers.delete(blockIndex);
          }
          continue;
        }

        if (event.type === 'message_delta') {
          stopReasonThisCall = event.delta?.stop_reason ?? undefined;
          inputTokensThisCall = Math.max(
            inputTokensThisCall,
            event.usage?.input_tokens ?? 0
          );
          outputTokensThisCall = Math.max(
            outputTokensThisCall,
            event.usage?.output_tokens ?? 0
          );
          continue;
        }
      }

      totalInputTokens += inputTokensThisCall;
      totalOutputTokens += outputTokensThisCall;
      lastModel = modelThisCall ?? lastModel;
      lastStopReason = stopReasonThisCall ?? lastStopReason;

      // End LLM span with token usage and outcome
      llmSpan?.end({
        inputTokens: inputTokensThisCall,
        outputTokens: outputTokensThisCall,
        stopReason: stopReasonThisCall,
        toolCount: toolUsesThisCall.length,
        model: modelThisCall,
      });

      const wantsToolUse =
        stopReasonThisCall === 'tool_use' || toolUsesThisCall.length > 0;

      // Debug: Log what each iteration produced (Story 7.5 duplicate detection)
      logger.debug({
        event: 'agent.loop.iteration_complete',
        iteration,
        stopReason: stopReasonThisCall,
        wantsToolUse,
        attemptResponseLength: attemptResponse.length,
        attemptResponsePreview: attemptResponse.slice(0, 200),
        toolCount: toolUsesThisCall.length,
        traceId: context.traceId,
      });

      if (!wantsToolUse) {
        break;
      }

      if (iteration === MAX_TOOL_LOOPS - 1) {
        maxToolLoopsReached = true;
      }

      if (toolUsesThisCall.length === 0) {
        logger.warn({
          event: 'agent.loop.tool_use_missing_blocks',
          userId: context.userId,
          channelId: context.channelId,
          traceId: context.traceId,
        });
        break;
      }

      toolCount += toolUsesThisCall.length;
      // Story 7.3: Pass tool context for rich status messages (AC1, AC4)
      void options.setStatus?.({
        phase: 'tool',
        toolName: toolUsesThisCall[0]?.name ?? null,
        toolInput: toolUsesThisCall[0]?.input as Record<string, unknown> | undefined,
        allTools: toolUsesThisCall.map((t) => ({
          name: t.name,
          input: t.input as Record<string, unknown>,
        })),
      });

      // Append assistant message containing text (if any) + tool_use blocks.
      // Fix: Include text block to match Anthropic's conversation format.
      // This ensures Claude remembers what it said before the tool call.
      const assistantContent: Anthropic.ContentBlockParam[] = [];

      // Include any text that came before tool_use (e.g., "I'll search for that...")
      if (attemptResponse.trim().length > 0) {
        assistantContent.push({ type: 'text', text: attemptResponse });
      }

      // Include tool_use blocks
      assistantContent.push(
        ...toolUsesThisCall.map((t) => ({
          type: 'tool_use' as const,
          id: t.id,
          name: t.name,
          input: t.input as Record<string, unknown>,
        }))
      );

      attemptMessages.push({
        role: 'assistant',
        content: assistantContent,
      });

      const toolResults = await Promise.all(
        toolUsesThisCall.map(async (toolUse) => {
          // Story 2.9 AC#4: Skip tools with parse failures
          if (toolUse._skipExecution) {
            logger.warn({
              event: 'tool.execution.skipped',
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              reason: 'input_parse_failed',
              traceId: context.traceId,
            });
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                success: false,
                error: {
                  code: 'TOOL_INPUT_PARSE_FAILED',
                  message: `Tool '${toolUse.name}' input could not be parsed from streamed JSON`,
                  retryable: false,
                },
              }),
            };
          }

          // Create a span for this tool call (full input/output visibility)
          const toolSpan = createAgentSpan(trace, `tool.${toolUse.name}`, {
            toolName: toolUse.name,
            input: toolUse.input,
          });

          const startMs = Date.now();
          const result = options.executeTool
            ? await options.executeTool({
                name: toolUse.name,
                toolUseId: toolUse.id,
                input: toolUse.input,
                traceId: context.traceId,
              })
            : {
                success: false,
                error: {
                  code: 'TOOL_NOT_IMPLEMENTED',
                  message: `Tool '${toolUse.name}' is not available yet`,
                  retryable: false,
                },
              };

          // End tool span with output and duration
          toolSpan?.end({
            output: result,
            durationMs: Date.now() - startMs,
          });
          
          // Extract URL sources from tool results (e.g., web search results)
          // Handle ToolResult wrapper: extract from data field if success
          const resultData = result && typeof result === 'object' && 'success' in result && 'data' in result
            ? (result as { success: boolean; data: unknown }).data
            : result;
          const urlSources = extractUrlSourcesFromResult(toolUse.name, resultData);
          
          logger.debug({
            event: 'tool.sources.extracted',
            toolName: toolUse.name,
            urlSourcesCount: urlSources.length,
            urlSources: urlSources.slice(0, 3).map(s => ({ title: s.title, url: s.url })),
            traceId: context.traceId,
          });
          
          for (const src of urlSources) {
            if (!toolSourcesMap.has(src.url ?? src.reference)) {
              toolSourcesMap.set(src.url ?? src.reference, src);
            }
          }
          
          // If no URL sources found, track tool call itself as a source with context
          // Key by tool name + query context to allow multiple calls with different queries
          if (urlSources.length === 0) {
            const displayName = formatToolDisplayName(toolUse.name);
            const toolContext = summarizeToolInput(toolUse.input) || 'data lookup';
            const dedupKey = `${toolUse.name}::${toolContext.slice(0, 20)}`;
            
            if (!toolSourcesMap.has(dedupKey)) {
              toolSourcesMap.set(dedupKey, {
                type: 'tool',
                title: displayName,
                reference: toolUse.name,
                toolContext,
              });
            }
          }

          // Extract actual content from ToolResult wrapper
          // Claude should see the data directly, not {"success":true,"data":"..."}
          let toolContent: string;
          if (result && typeof result === 'object' && 'success' in result) {
            const tr = result as { success: boolean; data?: unknown; error?: unknown };
            if (tr.success && tr.data !== undefined) {
              toolContent = typeof tr.data === 'string' ? tr.data : JSON.stringify(tr.data);
            } else if (!tr.success && tr.error) {
              toolContent = JSON.stringify(tr.error);
            } else {
              toolContent = JSON.stringify(result);
            }
          } else {
            toolContent = typeof result === 'string' ? result : JSON.stringify(result);
          }

          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolContent,
          };
        })
      );

      attemptMessages.push({
        role: 'user',
        content: toolResults as unknown as Anthropic.ContentBlockParam[],
      });
    }

    if (maxToolLoopsReached) {
      logger.warn({
        event: 'agent.loop.max_tool_loops_reached',
        userId: context.userId,
        channelId: context.channelId,
        maxToolLoops: MAX_TOOL_LOOPS,
        toolCount,
        traceId: context.traceId,
      });
    }

    actSpan?.end({
      output: {
        responseLength: attemptResponse.length,
        toolCount,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        stopReason: lastStopReason,
        maxToolLoopsReached,
        verificationAttempt: verificationAttempts,
      },
    });

    // Story 2.3: Verify the buffered response
    const verifySpan = createAgentSpan(trace, 'agent.verify', {
      responseLength: attemptResponse.length,
      attempt: verificationAttempts,
    });

    void options.setStatus?.({ phase: 'verify' });

    // Use enhanced verification (Story 2.3)
    verification = verifyResponse(attemptResponse, verificationContext);
    // Also run legacy verify for backwards compatibility
    const legacyVerification = verify(attemptResponse);
    // Merge issues if legacy finds additional problems
    if (!legacyVerification.passed) {
      verification = {
        passed: verification.passed && legacyVerification.passed,
        issues: [
          ...verification.issues,
          ...legacyVerification.issues.map((msg) => ({
            code: 'LEGACY',
            message: msg,
            severity: 'error' as const,
          })),
        ],
        feedback:
          verification.feedback +
          (legacyVerification.feedback !== 'OK'
            ? '\n' + legacyVerification.feedback
            : ''),
      };
    }

    verifySpan?.end({
      output: {
        passed: verification.passed,
        issuesCount: verification.issues.length,
        attempt: verificationAttempts,
        issueCodes: verification.issues.map((i) => i.code),
      },
    });

    // Story 2.3 AC#5: Emit Langfuse event for verification tracking (dashboards)
    const langfuseClient = getLangfuse();
    if (langfuseClient?.event) {
      langfuseClient.event({
        name: 'verification_result',
        metadata: {
          traceId: context.traceId,
          attempt: verificationAttempts,
          passed: verification.passed,
          issueCodes: verification.issues.map((i) => i.code),
          responseLength: attemptResponse.length,
          userMessageLength: userMessage.length,
        },
      });
    }

    logger.info({
      event: 'agent.verify.attempt',
      userId: context.userId,
      channelId: context.channelId,
      attempt: verificationAttempts,
      passed: verification.passed,
      issueCodes: verification.issues.map((i) => i.code),
      responseLength: attemptResponse.length,
      traceId: context.traceId,
    });

    // Store the response for potential retry feedback
    verifiedResponse = attemptResponse;

    // If verification passed, break out of retry loop
    if (verification.passed) {
      break;
    }

    // Log retry if not last attempt
    if (verificationAttempts < MAX_VERIFICATION_ATTEMPTS) {
      logger.info({
        event: 'agent.verify.retry',
        userId: context.userId,
        channelId: context.channelId,
        attempt: verificationAttempts,
        nextAttempt: verificationAttempts + 1,
        feedback: verification.feedback.slice(0, 200),
        traceId: context.traceId,
      });
      verificationAttempts++;
    } else {
      // Don't increment on last attempt - we're done
      break;
    }
  }

  // Story 2.3: Yield verified content OR graceful failure (AC#2, AC#4)
  if (verification.passed) {
    // Debug log for duplicate detection (Story 7.5)
    logger.debug({
      event: 'agent.loop.yielding_response',
      responseLength: verifiedResponse.length,
      responsePreview: verifiedResponse.slice(0, 200),
      traceId: context.traceId,
    });

    // Yield the verified response to the caller (chunked for Slack streaming)
    const chunks = chunkVerifiedOutput(verifiedResponse);
    const pacingMs =
      chunks.length <= 1 ? 0 : Math.min(300, Math.ceil(300 / (chunks.length - 1)));
    for (let idx = 0; idx < chunks.length; idx++) {
      yield chunks[idx] ?? '';
      if (pacingMs > 0 && idx < chunks.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, pacingMs));
      }
    }
  } else {
    // All attempts failed - yield graceful failure response
    gracefulFailure = true;
    const failureResponse = createGracefulFailureResponse(
      verificationAttempts,
      verification.issues
    );
    const chunks = chunkVerifiedOutput(failureResponse);
    const pacingMs =
      chunks.length <= 1 ? 0 : Math.min(300, Math.ceil(300 / (chunks.length - 1)));
    for (let idx = 0; idx < chunks.length; idx++) {
      yield chunks[idx] ?? '';
      if (pacingMs > 0 && idx < chunks.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, pacingMs));
      }
    }

    logger.warn({
      event: 'agent.verify.exhausted',
      userId: context.userId,
      channelId: context.channelId,
      attempts: verificationAttempts,
      finalIssueCodes: verification.issues.map((i) => i.code),
      traceId: context.traceId,
    });

    // Story 2.3 AC#5: Emit Langfuse event for verification exhausted (dashboards)
    const exhaustedClient = getLangfuse();
    if (exhaustedClient?.event) {
      exhaustedClient.event({
        name: 'verification_exhausted',
        metadata: {
          traceId: context.traceId,
          maxAttempts: MAX_VERIFICATION_ATTEMPTS,
          finalIssueCodes: verification.issues.map((i) => i.code),
        },
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const nfr1Met = durationMs < 3000;

  logger.info({
    event: 'agent.loop.complete',
    userId: context.userId,
    channelId: context.channelId,
    durationMs,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    model: lastModel,
    stopReason: lastStopReason,
    toolCount,
    verificationPassed: verification.passed,
    verificationAttempts,
    gracefulFailure,
    traceId: context.traceId,
  });

  void options.setStatus?.({ phase: 'final' });
  
  // Merge gather sources with tool sources
  const toolSources = Array.from(toolSourcesMap.values());
  const allSources = [...sources, ...toolSources];
  
  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs,
    nfr1Met,
    sources: allSources,
    verification,
    toolCount,
    verificationAttempts,
    gracefulFailure,
  };
}


