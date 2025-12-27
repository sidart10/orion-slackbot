import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

function parseOptionalInt(envKey: string): number | undefined {
  const raw = process.env[envKey];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalFloat(envKey: string): number | undefined {
  const raw = process.env[envKey];
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function loadDefaultAnthropicModelFromOrionConfig(): string {
  try {
    const configPath = resolve(process.cwd(), '.orion', 'config.yaml');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = YAML.parse(raw) as unknown as {
      model?: { default?: string };
    };
    return parsed?.model?.default ?? '';
  } catch {
    return '';
  }
}

const defaultAnthropicModel = loadDefaultAnthropicModelFromOrionConfig();

export const config = {
  // Slack
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? '',
  slackAppToken: process.env.SLACK_APP_TOKEN ?? '',
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? '',

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? defaultAnthropicModel,
  // Optional: used for compaction threshold calculations (Story 2.6)
  anthropicMaxContextTokens: parseOptionalInt('ANTHROPIC_MAX_CONTEXT_TOKENS'),

  // Context compaction (Story 2.6) - all optional; handler applies safe defaults
  compactionThreshold: parseOptionalFloat('COMPACTION_THRESHOLD'),
  compactionKeepLastN: parseOptionalInt('COMPACTION_KEEP_LAST_N'),
  compactionMaxSummaryTokens: parseOptionalInt('COMPACTION_MAX_SUMMARY_TOKENS'),
  compactionTimeoutMs: parseOptionalInt('COMPACTION_TIMEOUT_MS'),

  // Thread history context (Slack) - optional overrides
  threadHistoryLimit: parseOptionalInt('THREAD_HISTORY_LIMIT'),
  threadHistoryMaxTokens: parseOptionalInt('THREAD_HISTORY_MAX_TOKENS'),

  // GCS
  gcsMemoriesBucket: process.env.GCS_MEMORIES_BUCKET ?? '',

  // Langfuse
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
  langfuseBaseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',

  // Application
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

// Validate required variables in production
if (config.nodeEnv === 'production') {
  const required = [
    'slackBotToken',
    'slackSigningSecret',
    'anthropicApiKey',
    'anthropicModel',
    'gcsMemoriesBucket',
    'langfusePublicKey',
    'langfuseSecretKey',
  ] as const;

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable for ${key}`);
    }
  }
}

