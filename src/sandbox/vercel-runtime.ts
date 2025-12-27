/**
 * Vercel Sandbox Runtime Module
 *
 * Provides Vercel Sandbox integration for executing Anthropic SDK
 * in an isolated environment with proper timeout handling.
 *
 * Architecture Pattern:
 *   Slack → Vercel Function → Vercel Sandbox → Anthropic SDK → Claude API
 *                ↑                                    ↓
 *                └────────── Slack chat.update ──────┘
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 * @see AC#1 - Anthropic SDK runs messages.create() successfully
 * @see AC#2 - Anthropic SDK is installed in sandbox
 * @see AC#3 - Response updates Slack message via callback
 * @see AC#4 - Graceful error handling with SANDBOX_CREATION_FAILED, SANDBOX_TIMEOUT
 * @see AC#5 - End-to-end "Hello" → Claude response works
 * @see AC#6 - Langfuse observation with timing and token usage
 */

import ms from 'ms';
import { Sandbox } from '@vercel/sandbox';
import { WebClient } from '@slack/web-api';
import { getLangfuse, type LangfuseTrace } from '../observability/langfuse.js';
import {
  createOrionError,
  ErrorCode,
  isOrionError,
  getUserMessage,
  type ErrorCodeType,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';

/**
 * Input parameters for sandbox execution
 */
export interface SandboxExecutionInput {
  /** The user's current message */
  userMessage: string;
  /**
   * Previous messages in thread formatted for Claude.
   * Expected format: Array of strings with "User: message" or "Assistant: message" prefix.
   * The prefix is used to determine the role for each message.
   * If no prefix is found, messages alternate user/assistant starting with user.
   */
  threadHistory: string[];
  /** Slack channel ID */
  slackChannel: string;
  /** Slack message timestamp to update */
  slackMessageTs: string;
  /** Slack bot token for API calls */
  slackToken: string;
  /** Optional Langfuse trace ID for correlation */
  traceId?: string;
}

/**
 * Result from sandbox execution
 */
export interface SandboxExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** The agent's response content (on success) */
  response?: string;
  /** Error message (on failure) */
  error?: string;
  /** Error code for categorization (on failure) */
  errorCode?: string;
  /** Token usage from Claude API */
  tokenUsage?: { input: number; output: number };
  /** Execution duration in milliseconds */
  duration: number;
}

/** Default timeout: 10 minutes per story spec */
const DEFAULT_TIMEOUT = ms('10m');

/** vCPUs for sandbox: 4 recommended for Claude */
const SANDBOX_VCPUS = 4;

/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 3;

/**
 * Parse agent script output from stdout
 *
 * Handles both JSON output (with text and tokenUsage) and raw text fallback.
 *
 * @param stdout - Raw stdout from agent execution
 * @returns Parsed output with text, tokenUsage, and optional error
 */
export function parseAgentOutput(stdout: string): {
  text: string;
  tokenUsage?: { input: number; output: number };
  error?: string;
} {
  if (!stdout.trim()) {
    return { text: '' };
  }

  try {
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      return { text: '', error: parsed.error };
    }
    return {
      text: parsed.text || '',
      tokenUsage: parsed.tokenUsage,
    };
  } catch {
    // If not JSON, treat as raw text output
    return { text: stdout.trim() };
  }
}

/**
 * Parse role from prefixed message format
 *
 * @param msg - Message string, optionally prefixed with "User: " or "Assistant: "
 * @param index - Index in array for fallback alternation
 * @returns Object with role and content
 */
function parseMessageRole(
  msg: string,
  index: number
): { role: 'user' | 'assistant'; content: string } {
  const userPrefix = /^User:\s*/i;
  const assistantPrefix = /^Assistant:\s*/i;

  if (userPrefix.test(msg)) {
    return { role: 'user', content: msg.replace(userPrefix, '') };
  }
  if (assistantPrefix.test(msg)) {
    return { role: 'assistant', content: msg.replace(assistantPrefix, '') };
  }
  // Fallback: alternate starting with user
  return {
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: msg,
  };
}

/**
 * Build the agent script to execute in sandbox
 *
 * Creates a Node.js ESM script that:
 * 1. Imports Anthropic SDK
 * 2. Builds messages from thread history
 * 3. Calls Claude API with Slack formatting rules
 * 4. Outputs JSON with text and token usage
 *
 * @param input - Sandbox execution input
 * @returns JavaScript code string for agent.mjs
 */
function buildAgentScript(input: SandboxExecutionInput): string {
  const model = config.anthropicModel;

  // Pre-parse thread history to proper message format
  const messages = input.threadHistory.map((msg, i) => parseMessageRole(msg, i));
  messages.push({ role: 'user', content: input.userMessage });

  const escapedMessages = JSON.stringify(messages);
  const escapedModel = JSON.stringify(model);

  return `
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function main() {
  const messages = ${escapedMessages};
  const model = ${escapedModel};

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: \`You are Orion, a helpful AI assistant. 
Follow these formatting rules for Slack:
- Use *bold* for emphasis (not **)
- Use _italic_ for secondary emphasis
- Use bullet points with •
- Never use blockquotes
- Never use emojis unless requested\`,
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    console.log(JSON.stringify({
      text,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    }));
  } catch (err) {
    // Handle specific Claude API errors
    let errorMessage = err.message || 'Unknown error';
    
    if (err.status === 429) {
      errorMessage = 'rate_limit_exceeded';
    } else if (err.status === 400 && err.message?.includes('context')) {
      errorMessage = 'context_length_exceeded';
    } else if (err.status === 401) {
      errorMessage = 'invalid_api_key';
    }
    
    console.log(JSON.stringify({ error: errorMessage }));
    process.exit(1);
  }
}

main();
`;
}

/**
 * Create sandbox with retry logic for transient failures (NFR15)
 *
 * Implements exponential backoff for sandbox creation failures.
 *
 * @returns Created sandbox instance
 * @throws OrionError with SANDBOX_CREATION_FAILED if all retries fail
 */
async function createSandboxWithRetry(): Promise<InstanceType<typeof Sandbox>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const sandbox = await Sandbox.create({
        resources: { vcpus: SANDBOX_VCPUS },
        timeout: DEFAULT_TIMEOUT,
        runtime: 'node22',
      });

      logger.info({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'sandbox_created',
        sandboxId: sandbox.sandboxId,
        attempt: attempt + 1,
      });

      return sandbox;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'sandbox_creation_retry',
        attempt: attempt + 1,
        error: lastError.message,
      });

      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s, 4s...
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  // Detect timeout errors and use appropriate error code (AC#4)
  const errorMessage = lastError?.message || 'Failed to create sandbox after retries';
  const isTimeout =
    errorMessage.includes('timeout') || errorMessage.includes('timed out');

  throw createOrionError(
    isTimeout ? ErrorCode.SANDBOX_TIMEOUT : ErrorCode.SANDBOX_CREATION_FAILED,
    errorMessage
  );
}

/**
 * Execute the Orion agent inside a Vercel Sandbox
 *
 * This is the main entry point for running Anthropic SDK in isolation.
 * It handles:
 * - Sandbox creation with retry logic
 * - SDK installation
 * - Agent script execution
 * - Slack message update
 * - Langfuse tracing
 * - Cleanup
 *
 * @param input - Execution input parameters
 * @returns Execution result with response or error
 *
 * @example
 * const result = await executeAgentInSandbox({
 *   userMessage: 'Hello, Orion!',
 *   threadHistory: [],
 *   slackChannel: 'C123',
 *   slackMessageTs: '1234567890.123456',
 *   slackToken: 'xoxb-...',
 * });
 */
export async function executeAgentInSandbox(
  input: SandboxExecutionInput
): Promise<SandboxExecutionResult> {
  // #region agent log
  const debugH5Entry = {location:'vercel-runtime.ts:303',message:'executeAgentInSandbox entry',data:{userMessageLen:input.userMessage?.length,threadHistoryLen:input.threadHistory?.length,slackChannel:input.slackChannel,hasAnthropicKey:!!process.env.ANTHROPIC_API_KEY,anthropicKeyLen:process.env.ANTHROPIC_API_KEY?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'};
  console.log('[DEBUG]', JSON.stringify(debugH5Entry));
  fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH5Entry)}).catch(()=>{});
  // #endregion
  const startTime = process.hrtime.bigint();
  let sandbox: InstanceType<typeof Sandbox> | null = null;

  const getDurationMs = (): number => {
    const diffNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(diffNs / 1_000_000n);
    // Ensure duration is never reported as 0ms in fast/mock executions
    return Math.max(1, durationMs);
  };

  // Create Langfuse trace
  const langfuseClient = getLangfuse();
  const trace: LangfuseTrace | null = langfuseClient?.trace({
    name: 'sandbox-execution',
    metadata: {
      slackChannel: input.slackChannel,
      messageTs: input.slackMessageTs,
    },
  }) ?? null;

  try {
    // Create sandbox with retry
    const createSpan = trace?.span({ name: 'sandbox-create' });
    // #region agent log
    const debugH3Pre = {location:'vercel-runtime.ts:328',message:'About to create sandbox',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'};
    console.log('[DEBUG]', JSON.stringify(debugH3Pre));
    fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH3Pre)}).catch(()=>{});
    // #endregion
    sandbox = await createSandboxWithRetry();
    // #region agent log
    const debugH3Post = {location:'vercel-runtime.ts:333',message:'Sandbox created successfully',data:{sandboxId:sandbox.sandboxId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'};
    console.log('[DEBUG]', JSON.stringify(debugH3Post));
    fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH3Post)}).catch(()=>{});
    // #endregion
    createSpan?.end({ output: { sandboxId: sandbox.sandboxId } });

    // Install Anthropic SDK
    const installSpan = trace?.span({ name: 'install-sdk' });
    const installResult = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '@anthropic-ai/sdk'],
      cwd: '/vercel/sandbox',
    });

    if (installResult.exitCode !== 0) {
      const installStderr = await installResult.stderr();
      // #region agent log
      const debugH4Fail = {location:'vercel-runtime.ts:344',message:'npm install FAILED',data:{exitCode:installResult.exitCode,stderrLen:installStderr?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'};
      console.log('[DEBUG]', JSON.stringify(debugH4Fail));
      fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH4Fail)}).catch(()=>{});
      // #endregion
      installSpan?.end({ level: 'ERROR', statusMessage: 'SDK install failed' });
      throw createOrionError(
        ErrorCode.SANDBOX_SETUP_FAILED,
        `npm install failed: ${installStderr}`
      );
    }
    // #region agent log
    const debugH4Pass = {location:'vercel-runtime.ts:353',message:'npm install succeeded',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'};
    console.log('[DEBUG]', JSON.stringify(debugH4Pass));
    fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH4Pass)}).catch(()=>{});
    // #endregion
    installSpan?.end();

    // Build and write agent script
    const agentScript = buildAgentScript(input);
    await sandbox.writeFiles([
      {
        path: '/vercel/sandbox/agent.mjs',
        content: Buffer.from(agentScript),
      },
    ]);

    // Execute agent
    const executeSpan = trace?.span({ name: 'execute-agent' });
    const result = await sandbox.runCommand({
      cmd: 'node',
      args: ['agent.mjs'],
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      },
    });

    if (result.exitCode !== 0) {
      const stderrOutput = await result.stderr();
      // #region agent log
      const debugH5Fail = {location:'vercel-runtime.ts:376',message:'Agent script FAILED',data:{exitCode:result.exitCode,stderrSnippet:stderrOutput?.slice(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'};
      console.log('[DEBUG]', JSON.stringify(debugH5Fail));
      fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH5Fail)}).catch(()=>{});
      // #endregion
      executeSpan?.end({ level: 'ERROR', statusMessage: stderrOutput });
      throw createOrionError(
        ErrorCode.AGENT_EXECUTION_FAILED,
        `Agent exited with code ${result.exitCode}: ${stderrOutput}`
      );
    }
    // #region agent log
    const stdoutForLog = await result.stdout();
    const debugH5Pass = {location:'vercel-runtime.ts:385',message:'Agent script succeeded',data:{stdoutLen:stdoutForLog?.length,stdoutSnippet:stdoutForLog?.slice(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'};
    console.log('[DEBUG]', JSON.stringify(debugH5Pass));
    fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH5Pass)}).catch(()=>{});
    // #endregion

    // Parse response
    const stdoutOutput = await result.stdout();
    const output = parseAgentOutput(stdoutOutput);

    if (output.error) {
      executeSpan?.end({ level: 'ERROR', statusMessage: output.error });
      throw createOrionError(ErrorCode.AGENT_EXECUTION_FAILED, output.error);
    }

    executeSpan?.end({
      output: { responseLength: output.text.length },
    });

    // Update trace with token usage
    if (output.tokenUsage) {
      trace?.update({
        usage: {
          promptTokens: output.tokenUsage.input,
          completionTokens: output.tokenUsage.output,
        },
      });
    }

    // Update Slack message (with error handling - don't throw on failure)
    try {
      const slackClient = new WebClient(input.slackToken);
      await slackClient.chat.update({
        channel: input.slackChannel,
        ts: input.slackMessageTs,
        text: output.text,
      });
    } catch (slackError) {
      logger.error({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'slack_update_failed',
        error:
          slackError instanceof Error ? slackError.message : String(slackError),
        channel: input.slackChannel,
        messageTs: input.slackMessageTs,
      });
      // Don't throw - the agent succeeded, just Slack update failed
    }

    const duration = getDurationMs();
    trace?.update({ output: { success: true, duration } });

    return {
      success: true,
      response: output.text,
      tokenUsage: output.tokenUsage,
      duration,
    };
  } catch (error) {
    const duration = getDurationMs();

    // Extract error details and determine error code
    let errorMessage: string;
    let errorCode: ErrorCodeType;

    if (isOrionError(error)) {
      errorMessage = error.message;
      errorCode = error.code;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      // Detect timeout errors and use SANDBOX_TIMEOUT code (AC#4)
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('timed out')
      ) {
        errorCode = ErrorCode.SANDBOX_TIMEOUT;
      } else {
        errorCode = ErrorCode.UNKNOWN_ERROR;
      }
    } else {
      errorMessage = String(error);
      errorCode = ErrorCode.UNKNOWN_ERROR;
    }

    logger.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'sandbox_execution_failed',
      error: errorMessage,
      errorCode,
      duration,
      traceId: input.traceId,
      sandboxId: sandbox?.sandboxId,
    });

    // Get user-friendly message from error code
    const userMessage = getUserMessage(errorCode);

    // Update Slack with error message
    try {
      const slackClient = new WebClient(input.slackToken);
      await slackClient.chat.update({
        channel: input.slackChannel,
        ts: input.slackMessageTs,
        text: userMessage,
      });
    } catch {
      // Ignore Slack update errors in error path
    }

    trace?.update({
      output: { success: false, error: errorMessage, errorCode, duration },
      level: 'ERROR',
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
      duration,
    };
  } finally {
    // Always cleanup sandbox
    if (sandbox) {
      try {
        await sandbox.stop();
        logger.info({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'sandbox_stopped',
        });
      } catch (stopError) {
        logger.warn({
          timestamp: new Date().toISOString(),
          level: 'warn',
          event: 'sandbox_stop_warning',
          error:
            stopError instanceof Error ? stopError.message : String(stopError),
        });
      }
    }
  }
}

