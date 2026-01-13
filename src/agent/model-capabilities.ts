/**
 * Model capability detection for Anthropic Claude models.
 *
 * Story 8.2: Tool Search requires Sonnet 4.5+ or Opus 4.5+
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use/tool-search
 */

/**
 * Patterns for models that support Tool Search.
 *
 * Tool Search requires:
 * - claude-sonnet-4-* (4.5+)
 * - claude-opus-4-* (4.5+)
 *
 * NOT supported:
 * - claude-3-* models
 * - claude-3-5-* models
 */
const TOOL_SEARCH_MODEL_PATTERNS = [
  /^claude-sonnet-4-/,
  /^claude-opus-4-/,
  /^claude-sonnet-4\.5-/,
  /^claude-opus-4\.5-/,
] as const;

/**
 * Check if a model supports Anthropic's Tool Search capability.
 *
 * Tool Search allows deferring tool loading until Claude needs them,
 * reducing token usage when many tools are available.
 *
 * @param model - Model identifier (e.g., 'claude-sonnet-4-20250514')
 * @returns true if model supports tool search, false otherwise
 *
 * @see Story 8.2 AC#6 - Graceful Degradation
 *
 * @example
 * supportsToolSearch('claude-sonnet-4-20250514') // true
 * supportsToolSearch('claude-opus-4-20250801') // true
 * supportsToolSearch('claude-3-5-sonnet-20241022') // false
 * supportsToolSearch('claude-3-opus-20240229') // false
 */
export function supportsToolSearch(model: string | undefined | null): boolean {
  if (!model) return false;

  return TOOL_SEARCH_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * Get model capabilities for the given model.
 *
 * @param model - Model identifier
 * @returns Object with capability flags
 */
export function getModelCapabilities(model: string | undefined | null): {
  toolSearch: boolean;
  ptc: boolean;
} {
  return {
    toolSearch: supportsToolSearch(model),
    ptc: supportsToolSearch(model), // PTC and Tool Search have same model requirements
  };
}
