import 'dotenv/config';
import { DEFAULT_MODEL, isValidModel } from './models.js';

export const config = {
  // Slack
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? '',
  slackAppToken: process.env.SLACK_APP_TOKEN ?? '',
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? '',

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,

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
    'langfusePublicKey',
    'langfuseSecretKey',
  ] as const;

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable for ${key}`);
    }
  }

  // Validate model identifier
  if (!isValidModel(config.anthropicModel)) {
    throw new Error(
      `Invalid ANTHROPIC_MODEL: "${config.anthropicModel}". ` +
        `Valid options: claude-sonnet-4-20250514, claude-opus-4-20250514, claude-3-5-haiku-20241022`
    );
  }
}

