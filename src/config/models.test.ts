/**
 * Tests for Model Configuration
 *
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 */

import { describe, it, expect } from 'vitest';
import {
  ANTHROPIC_MODELS,
  DEFAULT_MODEL,
  MODEL_INFO,
  isValidModel,
  type AnthropicModel,
} from './models.js';

describe('models config', () => {
  describe('ANTHROPIC_MODELS', () => {
    it('should export SONNET_4 model identifier', () => {
      expect(ANTHROPIC_MODELS.SONNET_4).toBe('claude-sonnet-4-20250514');
    });

    it('should export OPUS_4 model identifier', () => {
      expect(ANTHROPIC_MODELS.OPUS_4).toBe('claude-opus-4-20250514');
    });

    it('should export HAIKU_3_5 model identifier', () => {
      expect(ANTHROPIC_MODELS.HAIKU_3_5).toBe('claude-3-5-haiku-20241022');
    });
  });

  describe('DEFAULT_MODEL', () => {
    it('should be set to SONNET_4', () => {
      expect(DEFAULT_MODEL).toBe(ANTHROPIC_MODELS.SONNET_4);
    });

    it('should be a valid AnthropicModel', () => {
      expect(isValidModel(DEFAULT_MODEL)).toBe(true);
    });
  });

  describe('MODEL_INFO', () => {
    it('should have info for all models', () => {
      const models = Object.values(ANTHROPIC_MODELS);
      for (const model of models) {
        expect(MODEL_INFO[model]).toBeDefined();
        expect(MODEL_INFO[model].name).toBeTruthy();
        expect(MODEL_INFO[model].description).toBeTruthy();
      }
    });

    it('should have correct info for SONNET_4', () => {
      expect(MODEL_INFO[ANTHROPIC_MODELS.SONNET_4].name).toBe('Sonnet 4');
    });

    it('should have correct info for OPUS_4', () => {
      expect(MODEL_INFO[ANTHROPIC_MODELS.OPUS_4].name).toBe('Opus 4');
    });

    it('should have correct info for HAIKU_3_5', () => {
      expect(MODEL_INFO[ANTHROPIC_MODELS.HAIKU_3_5].name).toBe('Haiku 3.5');
    });
  });

  describe('isValidModel', () => {
    it('should return true for valid model identifiers', () => {
      expect(isValidModel('claude-sonnet-4-20250514')).toBe(true);
      expect(isValidModel('claude-opus-4-20250514')).toBe(true);
      expect(isValidModel('claude-3-5-haiku-20241022')).toBe(true);
    });

    it('should return false for invalid model identifiers', () => {
      expect(isValidModel('claude-invalid')).toBe(false);
      expect(isValidModel('gpt-4')).toBe(false);
      expect(isValidModel('')).toBe(false);
      expect(isValidModel('claude-sonnet-4')).toBe(false);
    });

    it('should return false for typos in model names', () => {
      expect(isValidModel('claude-sonet-4-20250514')).toBe(false);
      expect(isValidModel('claude-opus-4-20250515')).toBe(false);
    });
  });
});

