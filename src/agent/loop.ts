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
   */
  setStatus?: (params: { phase: 'gather' | 'act' | 'tool' | 'verify' | 'final'; toolName?: string | null }) => void | Promise<void>;
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
      } as unknown as Anthropic.MessageCreateParams)) as unknown as AsyncIterable<Anthropic.RawMessageStreamEvent>;

      let inputTokensThisCall = 0;
      let outputTokensThisCall = 0;
      let stopReasonThisCall: string | null | undefined;
      let modelThisCall: string | undefined;
      const toolUsesThisCall: Array<{ id: string; name: string; input: unknown }> = [];

      for await (const event of stream) {
        if (event.type === 'message_start') {
          modelThisCall = event.message?.model;
          continue;
        }

        if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            toolUsesThisCall.push({
              id: event.content_block.id,
              name: event.content_block.name,
              input: event.content_block.input,
            });
          }
          continue;
        }

        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            const text = event.delta.text ?? '';
            // Story 2.3: Buffer instead of yielding immediately (AC#2)
            attemptResponse += text;
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
      void options.setStatus?.({ phase: 'tool', toolName: toolUsesThisCall[0]?.name ?? null });

      // Append assistant message containing tool_use blocks.
      attemptMessages.push({
        role: 'assistant',
        content: toolUsesThisCall.map((t) => ({
          type: 'tool_use',
          id: t.id,
          name: t.name,
          input: t.input,
        })),
      });

      const toolResults = await Promise.all(
        toolUsesThisCall.map(async (toolUse) => {
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

          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              typeof result === 'string' ? result : JSON.stringify(result),
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
  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs,
    nfr1Met,
    sources,
    verification,
    toolCount,
    verificationAttempts,
    gracefulFailure,
  };
}


