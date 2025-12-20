/**
 * Anthropic Model Configuration
 *
 * Single source of truth for all Claude model identifiers.
 * Update model versions here when new releases are available.
 *
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 */

/**
 * Available Claude models with their identifiers
 */
export const ANTHROPIC_MODELS = {
  /** Claude Sonnet 4 - Balanced performance and cost */
  SONNET_4: 'claude-sonnet-4-20250514',

  /** Claude Opus 4 - Most capable, best for complex tasks */
  OPUS_4: 'claude-opus-4-20250514',

  /** Claude Haiku 3.5 - Fastest and most cost-effective */
  HAIKU_3_5: 'claude-3-5-haiku-20241022',
} as const;

/**
 * Type for valid model identifiers
 */
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];

/**
 * Default model used when ANTHROPIC_MODEL env var is not set
 */
export const DEFAULT_MODEL: AnthropicModel = ANTHROPIC_MODELS.SONNET_4;

/**
 * Model descriptions for documentation/logging
 */
export const MODEL_INFO: Record<AnthropicModel, { name: string; description: string }> = {
  [ANTHROPIC_MODELS.SONNET_4]: {
    name: 'Sonnet 4',
    description: 'Balanced performance and cost - recommended default',
  },
  [ANTHROPIC_MODELS.OPUS_4]: {
    name: 'Opus 4',
    description: 'Most capable model for complex reasoning tasks',
  },
  [ANTHROPIC_MODELS.HAIKU_3_5]: {
    name: 'Haiku 3.5',
    description: 'Fastest and most cost-effective for simple tasks',
  },
};

/**
 * Check if a string is a valid Anthropic model identifier
 */
export function isValidModel(model: string): model is AnthropicModel {
  return Object.values(ANTHROPIC_MODELS).includes(model as AnthropicModel);
}

