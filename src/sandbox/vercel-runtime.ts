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
import { createOrionError, ErrorCode, isOrionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Input parameters for sandbox execution
 */
export interface SandboxExecutionInput {
  /** The user's current message */
  userMessage: string;
  /** Previous messages in thread for context */
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
  const escapedMessage = JSON.stringify(input.userMessage);
  const escapedHistory = JSON.stringify(input.threadHistory);

  return `
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function main() {
  const userMessage = ${escapedMessage};
  const threadHistory = ${escapedHistory};

  // Build messages array from thread history
  const messages = threadHistory.map((msg, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: msg,
  }));
  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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

  throw createOrionError(
    ErrorCode.SANDBOX_CREATION_FAILED,
    lastError?.message || 'Failed to create sandbox after retries'
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
    sandbox = await createSandboxWithRetry();
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
      installSpan?.end({ level: 'ERROR', statusMessage: 'SDK install failed' });
      throw createOrionError(
        ErrorCode.SANDBOX_SETUP_FAILED,
        `npm install failed: ${installStderr}`
      );
    }
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
      executeSpan?.end({ level: 'ERROR', statusMessage: stderrOutput });
      throw createOrionError(
        ErrorCode.AGENT_EXECUTION_FAILED,
        `Agent exited with code ${result.exitCode}: ${stderrOutput}`
      );
    }

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
    let errorMessage: string;
    if (isOrionError(error)) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    logger.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'sandbox_execution_failed',
      error: errorMessage,
      duration,
      traceId: input.traceId,
    });

    // Determine user-friendly message based on error type
    let userMessage = 'I encountered an error. Please try again.';

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      userMessage = 'Your request took too long. Please try a simpler question.';
    } else if (errorMessage.includes('rate') || errorMessage.includes('429')) {
      userMessage = "I'm receiving too many requests. Please wait a moment.";
    } else if (
      errorMessage.includes('context') ||
      errorMessage.includes('tokens')
    ) {
      userMessage = 'Your conversation is too long. Please start a new thread.';
    }

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
      output: { success: false, error: errorMessage, duration },
      level: 'ERROR',
    });

    return {
      success: false,
      error: errorMessage,
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

