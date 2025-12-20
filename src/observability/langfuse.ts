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
  };
}

// Structured logging helper per AR12
function logStructured(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>
): void {
  const fn = level === 'warn' ? console.warn : console.log;
  fn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      service: 'orion-slack-agent',
      ...data,
    })
  );
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

/**
 * Langfuse prompt object interface
 */
export interface LangfusePrompt {
  /** Compile the prompt with variables */
  compile: (variables: Record<string, unknown>) => string;
  /** Raw prompt content */
  prompt: string;
  /** Prompt name */
  name: string;
  /** Prompt version */
  version: number;
}

/**
 * Fetch a prompt from Langfuse by name.
 *
 * @param promptName - Name of the prompt to fetch
 * @returns Prompt object with compile method
 * @throws Error if prompt not found or Langfuse not configured
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#4 - Fetch system prompt from Langfuse
 */
export async function getPrompt(promptName: string): Promise<LangfusePrompt> {
  const client = getLangfuse();

  if (!client) {
    throw new Error('Langfuse client not configured');
  }

  // Check if client has getPrompt method (real Langfuse client)
  const langfuseClient = client as unknown as {
    getPrompt?: (name: string) => Promise<LangfusePrompt>;
  };

  if (typeof langfuseClient.getPrompt !== 'function') {
    throw new Error('Langfuse prompt management not available (no-op client)');
  }

  try {
    const prompt = await langfuseClient.getPrompt(promptName);
    
    logStructured('info', 'langfuse_prompt_fetched', {
      promptName,
      version: prompt.version,
    });

    return prompt;
  } catch (error) {
    logStructured('error', 'langfuse_prompt_fetch_failed', {
      promptName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
