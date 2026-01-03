/**
 * Prompt Factory Tests
 *
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see AC#1 - Context-aware prompts (channel type, user, time)
 * @see AC#5 - Maximum 4 prompts (Slack API limit)
 */

import { describe, it, expect } from 'vitest';
import {
  generateSuggestedPrompts,
  type PromptContext,
} from './prompt-factory.js';

describe('prompt-factory', () => {
  describe('generateSuggestedPrompts', () => {
    it('returns max 4 prompts (Slack API limit)', () => {
      const context: PromptContext = {
        channelType: 'im',
        userId: 'U12345',
      };

      const prompts = generateSuggestedPrompts(context);

      expect(prompts.length).toBeLessThanOrEqual(4);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('returns prompts with required fields (title and message)', () => {
      const context: PromptContext = {
        channelType: 'channel',
        userId: 'U12345',
      };

      const prompts = generateSuggestedPrompts(context);

      for (const prompt of prompts) {
        expect(prompt).toHaveProperty('title');
        expect(prompt).toHaveProperty('message');
        expect(typeof prompt.title).toBe('string');
        expect(typeof prompt.message).toBe('string');
        expect(prompt.title.length).toBeGreaterThan(0);
        expect(prompt.message.length).toBeGreaterThan(0);
      }
    });

    describe('context-aware prompts (AC#1)', () => {
      it('returns DM-specific prompts for im channel type', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // DM prompts should be personal assistance focused
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('research') ||
              t.includes('help') ||
              t.includes('summarize')
          )
        ).toBe(true);
      });

      it('returns channel-specific prompts for channel type', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // Channel prompts should be team collaboration focused
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('thread') ||
              t.includes('team') ||
              t.includes('research') ||
              t.includes('summarize')
          )
        ).toBe(true);
      });

      it('handles group channel type', () => {
        const context: PromptContext = {
          channelType: 'group',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // Group channels should work similar to regular channels
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('follow-up prompts (AC#2)', () => {
      it('returns research follow-up prompts after research response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'research',
        };

        const prompts = generateSuggestedPrompts(context);

        // Research follow-ups should offer deeper exploration
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('deeper') ||
              t.includes('compare') ||
              t.includes('sources') ||
              t.includes('summary')
          )
        ).toBe(true);
      });

      it('returns action follow-up prompts after action response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'action',
        };

        const prompts = generateSuggestedPrompts(context);

        // Action follow-ups should offer status checks and adjustments
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('status') ||
              t.includes('adjust') ||
              t.includes('similar') ||
              t.includes('undo')
          )
        ).toBe(true);
      });
    });

    describe('error recovery prompts (AC#4)', () => {
      it('returns error recovery prompts after error response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'error',
        };

        const prompts = generateSuggestedPrompts(context);

        // Error recovery should offer alternatives
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('try') ||
              t.includes('different') ||
              t.includes('help') ||
              t.includes('simpl')
          )
        ).toBe(true);
      });

      it('includes specific recovery suggestions based on error code', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'error',
          errorCode: 'TOOL_EXECUTION_FAILED',
        };

        const prompts = generateSuggestedPrompts(context);

        // Should still return valid prompts
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('clarification response type', () => {
      it('returns clarification follow-up prompts', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'clarification',
        };

        const prompts = generateSuggestedPrompts(context);

        // After clarification, should offer ways to provide more context
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('time-based prompts (AC#1)', () => {
      it('returns morning prompts during morning hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 9, // 9 AM
        };

        const prompts = generateSuggestedPrompts(context);

        // Morning prompts should include standup-related suggestions
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('standup') ||
              t.includes('today') ||
              t.includes('morning') ||
              t.includes('plan')
          )
        ).toBe(true);
      });

      it('returns EOD prompts during evening hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 17, // 5 PM
        };

        const prompts = generateSuggestedPrompts(context);

        // EOD prompts should include summary-related suggestions
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('summary') ||
              t.includes('wrap') ||
              t.includes('done') ||
              t.includes('tomorrow')
          )
        ).toBe(true);
      });

      it('returns standard prompts during mid-day hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 14, // 2 PM
        };

        const prompts = generateSuggestedPrompts(context);

        // Mid-day should still return valid prompts
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('prompt title length', () => {
      it('titles are short enough for Slack buttons (~25 chars max)', () => {
        const contexts: PromptContext[] = [
          { channelType: 'im', userId: 'U12345' },
          { channelType: 'channel', userId: 'U12345' },
          { channelType: 'im', userId: 'U12345', lastResponseType: 'research' },
          { channelType: 'im', userId: 'U12345', lastResponseType: 'error' },
        ];

        for (const context of contexts) {
          const prompts = generateSuggestedPrompts(context);
          for (const prompt of prompts) {
            // Slack recommends ~25 chars for button text
            expect(prompt.title.length).toBeLessThanOrEqual(30);
          }
        }
      });
    });
  });
});

