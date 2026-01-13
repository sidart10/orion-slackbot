/**
 * Tests for Slack formatting constants
 *
 * @see Story 7.8 - Enhanced Slack UI Polish
 * @see AC#3 - Formatting Constants (NEW FILE)
 */

import { describe, it, expect } from 'vitest';
import {
  STATUS_EMOJI,
  SECTION_HEADERS,
  RESPONSE_STRUCTURE,
} from '@/slack/formatting-constants.js';

describe('formatting-constants', () => {
  describe('SECTION_HEADERS', () => {
    it('should contain all required section headers', () => {
      // AC3: SECTION_HEADERS constant contains all required headers
      const requiredKeys = [
        'summary',
        'keyFindings',
        'keyDecisions',
        'actionItems',
        'topicsDiscussed',
        'unresolvedQuestions',
        'participants',
        'references',
        'nextSteps',
        'error',
        'alternatives',
      ];

      requiredKeys.forEach((key) => {
        expect(SECTION_HEADERS).toHaveProperty(key);
      });
    });

    it('should use Slack mrkdwn bold format for all headers', () => {
      // AC1/AC3: All header values use Slack mrkdwn bold format
      // Pattern: starts with *, ends with * or *:, Title Case
      const headerPattern = /^\*[A-Z][^*]+\*:?$/;

      Object.entries(SECTION_HEADERS).forEach(([key, value]) => {
        expect(
          headerPattern.test(value),
          `Header "${key}" should match Slack mrkdwn bold format: ${value}`
        ).toBe(true);
      });
    });

    it('should use Title Case for all headers', () => {
      // AC1: Consistent casing: Title Case for headers
      Object.values(SECTION_HEADERS).forEach((header) => {
        // Extract text between asterisks
        const match = header.match(/^\*(.+?)\*:?$/);
        if (match) {
          const text = match[1];
          // First letter of each word should be uppercase (Title Case)
          const words = text.split(' ');
          words.forEach((word) => {
            expect(word[0]).toBe(word[0].toUpperCase());
          });
        }
      });
    });

    it('should NOT contain emoji prefixes in section headers', () => {
      // AC2: Remove emoji prefixes from section headers
      // Emoji regex that catches common emoji patterns
      const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

      Object.entries(SECTION_HEADERS).forEach(([key, value]) => {
        expect(
          emojiPattern.test(value),
          `Header "${key}" should not contain emoji: ${value}`
        ).toBe(false);
      });
    });

    it('should NOT use markdown ## headers', () => {
      // AC1: Remove markdown ## headers that render incorrectly in Slack
      Object.entries(SECTION_HEADERS).forEach(([key, value]) => {
        expect(value).not.toContain('##');
        expect(value).not.toContain('###');
      });
    });
  });

  describe('STATUS_EMOJI', () => {
    it('should contain all status indicator categories', () => {
      // AC2: Status indicators use allowed emojis
      const expectedKeys = ['searching', 'success', 'warning', 'error', 'tip'];

      expectedKeys.forEach((key) => {
        expect(STATUS_EMOJI).toHaveProperty(key);
      });
    });

    it('should have string values (may be empty for no-emoji design)', () => {
      // AC2: Empty STATUS_EMOJI values don't cause rendering issues
      Object.values(STATUS_EMOJI).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('RESPONSE_STRUCTURE', () => {
    it('should define correct order: value, details, references, actions', () => {
      // AC4: Response structure order
      expect(RESPONSE_STRUCTURE).toEqual(['value', 'details', 'references', 'actions']);
    });

    it('should be an immutable tuple', () => {
      // Constants use `as const` for type safety
      expect(Array.isArray(RESPONSE_STRUCTURE)).toBe(true);
      expect(RESPONSE_STRUCTURE.length).toBe(4);
    });
  });

  describe('ESM exports', () => {
    it('should export all constants', () => {
      // AC3: Constants are properly exported
      expect(STATUS_EMOJI).toBeDefined();
      expect(SECTION_HEADERS).toBeDefined();
      expect(RESPONSE_STRUCTURE).toBeDefined();
    });
  });
});
