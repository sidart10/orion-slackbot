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

  // Anthropic Beta Features (Story 6.2)
  // CONSOLIDATED: All beta headers in one place for easy management
  anthropic: {
    allBetas: [
      'context-management-2025-06-27', // Memory tool auto-context (Story 5.1)
      'advanced-tool-use-2025-11-20', // PTC - Programmatic Tool Calling (Story 6.3)
      'code-execution-2025-08-25', // Skills execution + container (Story 6.2)
      'skills-2025-10-02', // Skills API CRUD operations (Story 6.2)
      'files-api-2025-04-14', // File downloads from container (Story 6.2)
    ],
    // Enable/disable skills feature (default: true)
    skillsEnabled: process.env.ANTHROPIC_SKILLS_ENABLED !== 'false',
  },

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

  // GKE Agent Sandbox (Legacy - retained for orion_sandbox tool compatibility)
  // Note: Skills now execute in Anthropic managed container, but orion_sandbox
  // tool still uses GKE for custom Python script execution (Story 6.1)
  gkeSandboxRouterUrl:
    process.env.GKE_SANDBOX_ROUTER_URL ??
    'http://sandbox-router-svc.default.svc.cluster.local:8080',

  // GKE Cluster Configuration (Tech-Spec: Fix Sandbox Client K8s Lifecycle)
  gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ai-workflows-459123',
  gkeClusterName: process.env.GKE_CLUSTER_NAME ?? 'orion-sandbox-cluster',
  gkeClusterRegion: process.env.GKE_CLUSTER_REGION ?? 'us-central1',

  // MCP servers for injection into sandbox (Story 6.2)
  mcpServersJson: process.env.MCP_SERVERS_JSON ?? '{}',
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

  // Warn if GKE sandbox URL is using default (Story 6.2)
  if (config.gkeSandboxRouterUrl.includes('svc.cluster.local')) {
    // In-cluster default is fine, but external access needs explicit URL
    // This is expected when running inside GKE
  }
}

