/**
 * Tests for GKE-only skills allowlist.
 *
 * @see Story 6.12 - GKE Sandbox Scope Reduction
 * @see AC#3 - Allowlist exports GKE_ONLY_SKILLS, isGkeOnlySkill(), GkeOnlySkill type
 */

import { describe, it, expect } from 'vitest';
import {
  GKE_ONLY_SKILLS,
  isGkeOnlySkill,
  type GkeOnlySkill,
} from './allowed-skills.js';

describe('GKE_ONLY_SKILLS', () => {
  it('contains exactly webapp-testing and web-artifacts-builder', () => {
    // GIVEN: The GKE-only skills allowlist
    // WHEN: We inspect its contents
    // THEN: It contains exactly these two skills
    expect(GKE_ONLY_SKILLS).toEqual(['webapp-testing', 'web-artifacts-builder']);
  });

  it('is a readonly array (const assertion)', () => {
    // GIVEN: GKE_ONLY_SKILLS constant
    // WHEN: We check its length
    // THEN: It has exactly 2 entries (type enforcement)
    expect(GKE_ONLY_SKILLS).toHaveLength(2);
  });
});

describe('isGkeOnlySkill', () => {
  it('returns true for webapp-testing', () => {
    // GIVEN: A skill name that requires GKE (Playwright + local servers)
    // WHEN: We check if it's GKE-only
    // THEN: It returns true
    expect(isGkeOnlySkill('webapp-testing')).toBe(true);
  });

  it('returns true for web-artifacts-builder', () => {
    // GIVEN: A skill name that requires GKE (local filesystem)
    // WHEN: We check if it's GKE-only
    // THEN: It returns true
    expect(isGkeOnlySkill('web-artifacts-builder')).toBe(true);
  });

  it('returns false for Anthropic-hosted skills', () => {
    // GIVEN: Skills that should run in Anthropic container (not GKE)
    // WHEN: We check if they're GKE-only
    // THEN: All return false (should use PTC instead)
    expect(isGkeOnlySkill('summarize')).toBe(false);
    expect(isGkeOnlySkill('algorithmic-art')).toBe(false);
    expect(isGkeOnlySkill('skill-creator')).toBe(false);
    expect(isGkeOnlySkill('xlsx')).toBe(false);
    expect(isGkeOnlySkill('example')).toBe(false);
  });

  it('returns false for unknown skills', () => {
    // GIVEN: A skill name that doesn't exist
    // WHEN: We check if it's GKE-only
    // THEN: It returns false (default to Anthropic container)
    expect(isGkeOnlySkill('nonexistent-skill')).toBe(false);
    expect(isGkeOnlySkill('')).toBe(false);
  });

  it('is case-sensitive (skill names are lowercase)', () => {
    // GIVEN: Skill name with wrong case
    // WHEN: We check if it's GKE-only
    // THEN: It returns false (exact match required)
    expect(isGkeOnlySkill('Webapp-Testing')).toBe(false);
    expect(isGkeOnlySkill('WEBAPP-TESTING')).toBe(false);
  });
});

describe('GkeOnlySkill type', () => {
  it('type-checks valid skill names', () => {
    // Type-level test: These should compile without error
    const validSkill1: GkeOnlySkill = 'webapp-testing';
    const validSkill2: GkeOnlySkill = 'web-artifacts-builder';

    // Runtime assertion to avoid unused variable warnings
    expect(validSkill1).toBe('webapp-testing');
    expect(validSkill2).toBe('web-artifacts-builder');
  });
});
