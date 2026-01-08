/**
 * GKE-Only Skills Allowlist
 *
 * Single source of truth for skills that MUST run in GKE sandbox.
 * All other skills should use Anthropic container via PTC.
 *
 * @see Story 6.12 - GKE Sandbox Scope Reduction
 * @see ADR-2026-01-07 Anthropic Skills + Files API Adoption
 */

/**
 * Skills that MUST run in GKE sandbox due to requirements
 * that Anthropic's container cannot fulfill.
 *
 * CRITERIA for adding a skill here:
 * - Needs Playwright browser automation
 * - Needs local filesystem access for builds
 * - Needs local HTTP server execution
 * - Needs other capabilities Anthropic's container doesn't support
 *
 * All other skills should use Anthropic container via PTC.
 *
 * @see ADR-2026-01-07 Anthropic Skills + Files API Adoption
 */
export const GKE_ONLY_SKILLS = [
  'webapp-testing', // Needs Playwright + local HTTP servers
  'web-artifacts-builder', // Needs local filesystem for build outputs
] as const;

export type GkeOnlySkill = (typeof GKE_ONLY_SKILLS)[number];

/**
 * Check if a skill must run in GKE sandbox.
 * @param skillName - The skill name (without "skill:" prefix)
 * @returns true if skill requires GKE, false if should use Anthropic container
 */
export function isGkeOnlySkill(skillName: string): skillName is GkeOnlySkill {
  return (GKE_ONLY_SKILLS as readonly string[]).includes(skillName);
}
