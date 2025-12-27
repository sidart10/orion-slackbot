/**
 * Langfuse Client Singleton
 *
 * Provides a singleton Langfuse client for tracing throughout the application.
 * Handles missing credentials gracefully in development mode.
 *
 * @see AC#3 - Langfuse client singleton is available
 * @see AR11 - All handlers must be wrapped in Langfuse traces
 */

import { Langfuse } from 'langfuse';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

/**
 * Langfuse-like interface for tracing operations.
 * Abstracts the actual Langfuse client to allow for no-op implementations.
 */
export interface LangfuseTrace {
  id?: string;
  update: (data: Record<string, unknown>) => void;
  span: (data: { name: string; input?: unknown; metadata?: Record<string, unknown> }) => LangfuseSpan;
  generation: (data: Record<string, unknown>) => void;
}

export interface LangfuseSpan {
  end: (data?: Record<string, unknown>) => void;
}

export interface LangfuseLike {
  trace: (data: {
    name: string;
    userId?: string;
    sessionId?: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  }) => LangfuseTrace;
  flushAsync: () => Promise<void>;
  shutdownAsync: () => Promise<void>;
  // Feedback scoring methods - optional since noop client doesn't implement them
  score?: (data: Record<string, unknown>) => void;
  event?: (data: Record<string, unknown>) => void;
}

// Singleton instance
let langfuseInstance: LangfuseLike | null = null;

function createNoopLangfuse(): LangfuseLike {
  const noopSpan: LangfuseSpan = {
    end: (): void => {},
  };
  const noopTrace: LangfuseTrace = {
    id: 'noop-trace-id',
    update: (): void => {},
    span: (): LangfuseSpan => noopSpan,
    generation: (): void => {},
  };

  return {
    trace: (): LangfuseTrace => noopTrace,
    flushAsync: async (): Promise<void> => {},
    shutdownAsync: async (): Promise<void> => {},
    score: (): void => {},
    event: (): void => {},
  };
}

function logStructured(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>
): void {
  logger[level]({
    event,
    service: 'orion-slack-agent',
    ...data,
  });
}

/**
 * Get or create the Langfuse client singleton.
 *
 * @returns Langfuse client instance, or null if credentials are missing in development
 * @throws Error if credentials are missing in production
 */
export function getLangfuse(): LangfuseLike | null {
  if (langfuseInstance) {
    return langfuseInstance;
  }

  const publicKey = config.langfusePublicKey;
  const secretKey = config.langfuseSecretKey;
  const baseUrl = config.langfuseBaseUrl;
  const nodeEnv = config.nodeEnv ?? 'development';

  if (!publicKey || !secretKey) {
    if (nodeEnv === 'production') {
      throw new Error('Langfuse credentials required in production');
    }

    logStructured('warn', 'langfuse_client_disabled', {
      reason: 'missing_credentials',
      hint: 'Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables',
      mode: nodeEnv,
    });

    langfuseInstance = createNoopLangfuse();
    return langfuseInstance;
  }

  langfuseInstance = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  }) as unknown as LangfuseLike;

  logStructured('info', 'langfuse_client_initialized', {
    baseUrl,
  });

  return langfuseInstance;
}

/**
 * Prompt object returned from Langfuse.
 */
export interface LangfusePrompt {
  /** Compile the prompt with variables */
  compile: (variables: Record<string, string>) => string;
  /** Raw prompt content */
  prompt: string;
  /** Prompt name */
  name: string;
  /** Prompt version */
  version?: number;
}

/**
 * Get a prompt from Langfuse by name.
 *
 * Fetches the prompt from Langfuse prompt management.
 * Falls back to throwing an error if not found (caller should handle fallback).
 *
 * @param name - Prompt name in Langfuse
 * @returns Prompt object with compile() method
 * @throws Error if prompt not found or Langfuse not configured
 *
 * @see Story 2.1 - AC#4 - System prompt can be fetched from Langfuse
 */
export async function getPrompt(name: string): Promise<LangfusePrompt> {
  const client = getLangfuse();

  if (!client || !('getPrompt' in client)) {
    throw new Error('Langfuse client not available for prompt fetching');
  }

  try {
    // Type assertion for Langfuse client with getPrompt
    const langfuseClient = client as unknown as {
      getPrompt: (name: string) => Promise<LangfusePrompt>;
    };
    const prompt = await langfuseClient.getPrompt(name);
    return prompt;
  } catch (error) {
    logStructured('warn', 'langfuse_prompt_fetch_failed', {
      promptName: name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check for Langfuse connectivity.
 * Creates a test trace and flushes to verify the connection.
 *
 * @returns true if healthy, false if unhealthy or disabled
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getLangfuse();

    if (!client) {
      logStructured('warn', 'langfuse_health_check_skipped', {
        reason: 'client_not_configured',
      });
      return false;
    }

    // Create a minimal health check trace
    client.trace({ name: 'health-check' });
    await client.flushAsync();

    logStructured('info', 'langfuse_health_check_passed');
    return true;
  } catch (error) {
    logStructured('error', 'langfuse_health_check_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Gracefully shutdown the Langfuse client.
 * Flushes any pending traces and clears the singleton.
 */
export async function shutdown(): Promise<void> {
  if (langfuseInstance) {
    try {
      await langfuseInstance.shutdownAsync();
      logStructured('info', 'langfuse_client_shutdown');
    } catch (error) {
      logStructured('error', 'langfuse_shutdown_error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      langfuseInstance = null;
    }
  }
}

/**
 * Reset the singleton for testing purposes.
 * @internal Only for use in tests
 */
export function _resetForTesting(): void {
  langfuseInstance = null;
}

// --- Feedback Score Logging ---
// @see Story 1.8 - Feedback Button Infrastructure

export interface FeedbackScoreInput {
  isPositive: boolean;
  traceId: string | null;
  userId: string;
  channelId: string;
  messageTs: string;
  teamId?: string;
}

export interface FeedbackScoreResult {
  scored: boolean;
  orphan: boolean;
  metadata: {
    userId: string;
    channelId: string;
    messageTs: string;
    teamId?: string;
    isPositive: boolean;
  };
}

/**
 * Log user feedback to Langfuse as a score.
 *
 * If traceId is provided, logs a score on that trace.
 * If traceId is null (orphan feedback), logs an event instead.
 * Always calls flushAsync() to ensure persistence.
 *
 * @see AC#2 - Feedback correlated with original trace
 * @see AC#5 - Feedback appears on Langfuse dashboard
 * @see AC#6 - flushAsync() called after scoring
 * @see AC#7 - Orphan feedback logged as event
 * @see AC#8 - Metadata includes userId, channelId, messageTs
 */
export async function logFeedbackScore(
  input: FeedbackScoreInput
): Promise<FeedbackScoreResult> {
  const { isPositive, traceId, userId, channelId, messageTs, teamId } = input;

  const metadata = {
    userId,
    channelId,
    messageTs,
    teamId,
    isPositive,
  };

  const client = getLangfuse();

  if (traceId && client && client.score) {
    // Standard feedback with trace correlation
    client.score({
      name: 'user_feedback',
      value: isPositive ? 1 : 0,
      traceId,
      comment: isPositive ? 'positive' : 'negative',
      metadata,
    });

    await client.flushAsync();

    return { scored: true, orphan: false, metadata };
  }

  // Orphan feedback - log as event instead of score
  if (client && client.event) {
    client.event({
      name: 'orphan_feedback',
      metadata: {
        ...metadata,
        reason: 'trace_not_found',
      },
    });

    await client.flushAsync();
  }

  return { scored: false, orphan: true, metadata };
}
