/**
 * Tests for model capability detection.
 *
 * Story 8.2: Tool Search requires Sonnet 4.5+ or Opus 4.5+
 */

import { describe, it, expect } from 'vitest';
import { supportsToolSearch, getModelCapabilities } from '@/agent/model-capabilities.js';

describe('supportsToolSearch (Story 8.2 AC#6)', () => {
  // --------------------------------------------------------------------------
  // Supported Models - Sonnet 4
  // --------------------------------------------------------------------------

  describe('supported models - Sonnet 4', () => {
    it('returns true for claude-sonnet-4-20250514', () => {
      expect(supportsToolSearch('claude-sonnet-4-20250514')).toBe(true);
    });

    it('returns true for future Sonnet 4 models (claude-sonnet-4-20250801)', () => {
      expect(supportsToolSearch('claude-sonnet-4-20250801')).toBe(true);
    });

    it('returns true for claude-sonnet-4.5-* variants', () => {
      expect(supportsToolSearch('claude-sonnet-4.5-20251201')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Supported Models - Opus 4
  // --------------------------------------------------------------------------

  describe('supported models - Opus 4', () => {
    it('returns true for claude-opus-4-20250801', () => {
      expect(supportsToolSearch('claude-opus-4-20250801')).toBe(true);
    });

    it('returns true for future Opus 4 models (claude-opus-4-20251201)', () => {
      expect(supportsToolSearch('claude-opus-4-20251201')).toBe(true);
    });

    it('returns true for claude-opus-4.5-* variants', () => {
      expect(supportsToolSearch('claude-opus-4.5-20260101')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Unsupported Models - Claude 3.x
  // --------------------------------------------------------------------------

  describe('unsupported models - Claude 3.x', () => {
    it('returns false for claude-3-5-sonnet-20241022', () => {
      expect(supportsToolSearch('claude-3-5-sonnet-20241022')).toBe(false);
    });

    it('returns false for claude-3-opus-20240229', () => {
      expect(supportsToolSearch('claude-3-opus-20240229')).toBe(false);
    });

    it('returns false for claude-3-sonnet-20240229', () => {
      expect(supportsToolSearch('claude-3-sonnet-20240229')).toBe(false);
    });

    it('returns false for claude-3-haiku-20240307', () => {
      expect(supportsToolSearch('claude-3-haiku-20240307')).toBe(false);
    });

    it('returns false for claude-3-5-haiku-20241022', () => {
      expect(supportsToolSearch('claude-3-5-haiku-20241022')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns false for null model', () => {
      expect(supportsToolSearch(null)).toBe(false);
    });

    it('returns false for undefined model', () => {
      expect(supportsToolSearch(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(supportsToolSearch('')).toBe(false);
    });

    it('returns false for unknown model format', () => {
      expect(supportsToolSearch('some-custom-model')).toBe(false);
      expect(supportsToolSearch('gpt-4')).toBe(false);
      expect(supportsToolSearch('claude')).toBe(false);
    });

    it('handles model name with extra characters safely', () => {
      // Should not match partial names without proper prefix
      expect(supportsToolSearch('my-claude-sonnet-4-custom')).toBe(false);
      expect(supportsToolSearch('test-claude-opus-4-test')).toBe(false);
    });
  });
});

describe('getModelCapabilities', () => {
  it('returns toolSearch: true for Sonnet 4 models', () => {
    const caps = getModelCapabilities('claude-sonnet-4-20250514');
    expect(caps.toolSearch).toBe(true);
  });

  it('returns toolSearch: false for Claude 3.x models', () => {
    const caps = getModelCapabilities('claude-3-5-sonnet-20241022');
    expect(caps.toolSearch).toBe(false);
  });

  it('returns ptc: true for supported models (same as toolSearch)', () => {
    const caps = getModelCapabilities('claude-sonnet-4-20250514');
    expect(caps.ptc).toBe(true);
    expect(caps.toolSearch).toBe(caps.ptc);
  });

  it('handles null/undefined model gracefully', () => {
    const caps = getModelCapabilities(null);
    expect(caps.toolSearch).toBe(false);
    expect(caps.ptc).toBe(false);
  });
});
