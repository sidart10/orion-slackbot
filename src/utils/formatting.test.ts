/**
 * Tests for Slack mrkdwn formatting utilities
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#3 - Streamed response uses Slack mrkdwn formatting
 * @see AC#4 - No blockquotes in responses
 * @see AC#5 - No emojis unless explicitly requested
 * @see AR21 - Use *bold* NOT **bold**
 * @see AR22 - No blockquotes
 * @see AR23 - No emojis unless explicitly requested
 */

import { describe, it, expect } from 'vitest';
import { formatSlackMrkdwn, validateSlackFormat, stripEmojis } from './formatting.js';

describe('formatSlackMrkdwn', () => {
  describe('bold conversion (AR21)', () => {
    it('should convert markdown bold (**text**) to mrkdwn (*text*)', () => {
      expect(formatSlackMrkdwn('This is **bold** text')).toBe('This is *bold* text');
    });

    it('should convert multiple bold segments', () => {
      expect(formatSlackMrkdwn('**one** and **two**')).toBe('*one* and *two*');
    });

    it('should handle bold at start and end', () => {
      expect(formatSlackMrkdwn('**start** middle **end**')).toBe(
        '*start* middle *end*'
      );
    });

    it('should preserve existing mrkdwn bold', () => {
      expect(formatSlackMrkdwn('Already *bold* text')).toBe('Already _bold_ text');
    });
  });

  describe('italic conversion', () => {
    it('should convert markdown italic (*text*) to mrkdwn (_text_)', () => {
      expect(formatSlackMrkdwn('This is *italic* text')).toBe('This is _italic_ text');
    });

    it('should handle bold and italic together', () => {
      // **bold** becomes *bold*, then *italic* becomes _italic_
      expect(formatSlackMrkdwn('**bold** and *italic*')).toBe('*bold* and _italic_');
    });

    it('should not convert asterisks that are not formatting', () => {
      expect(formatSlackMrkdwn('5 * 3 = 15')).toBe('5 * 3 = 15');
    });
  });

  describe('blockquote removal (AR22)', () => {
    it('should convert blockquotes to bullet points', () => {
      expect(formatSlackMrkdwn('> This is a quote')).toBe('• This is a quote');
    });

    it('should convert multiple blockquotes', () => {
      expect(formatSlackMrkdwn('> First\n> Second')).toBe('• First\n• Second');
    });

    it('should handle blockquotes with extra spacing', () => {
      expect(formatSlackMrkdwn('>   Spaced quote')).toBe('•   Spaced quote');
    });

    it('should only convert blockquotes at line start', () => {
      expect(formatSlackMrkdwn('text > not a quote')).toBe('text > not a quote');
    });
  });

  describe('emoji stripping (AR23)', () => {
    it('should strip emojis by default', () => {
      expect(formatSlackMrkdwn('Hello 👋 world')).toBe('Hello  world');
    });

    it('should strip multiple emojis', () => {
      expect(formatSlackMrkdwn('🎉 Celebration 🥳')).toBe(' Celebration ');
    });

    it('should allow emojis when flag is set', () => {
      expect(formatSlackMrkdwn('Hello 👋 world', { allowEmojis: true })).toBe(
        'Hello 👋 world'
      );
    });

    it('should preserve Slack shortcode emojis', () => {
      expect(formatSlackMrkdwn('Hello :wave: world')).toBe('Hello :wave: world');
    });

    it('should strip various emoji types', () => {
      // Weather emoji
      expect(formatSlackMrkdwn('Weather: ☀️')).toBe('Weather: ');
      // Flag emoji
      expect(formatSlackMrkdwn('Flag: 🇺🇸')).toBe('Flag: ');
    });
  });

  describe('combined transformations', () => {
    it('should handle complex markdown with multiple features', () => {
      const input = '**Important:** *note* this\n> blockquote 👋';
      const expected = '*Important:* _note_ this\n• blockquote ';
      expect(formatSlackMrkdwn(input)).toBe(expected);
    });

    it('should preserve code blocks', () => {
      expect(formatSlackMrkdwn('Use `code` here')).toBe('Use `code` here');
    });

    it('should handle empty string', () => {
      expect(formatSlackMrkdwn('')).toBe('');
    });

    it('should handle plain text', () => {
      expect(formatSlackMrkdwn('Just plain text')).toBe('Just plain text');
    });
  });
});

describe('validateSlackFormat', () => {
  it('should return valid for properly formatted text', () => {
    const result = validateSlackFormat('This is *bold* and _italic_');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect markdown bold', () => {
    const result = validateSlackFormat('This has **markdown** bold');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain(
      'Contains markdown bold (**text**) instead of mrkdwn (*text*)'
    );
  });

  it('should detect blockquotes', () => {
    const result = validateSlackFormat('> This is a blockquote');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Contains blockquotes (not allowed per AR22)');
  });

  it('should report multiple issues', () => {
    const result = validateSlackFormat('**bold**\n> quote');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
});

describe('stripEmojis', () => {
  it('should remove face emojis', () => {
    expect(stripEmojis('Hello 😀😃😄')).toBe('Hello ');
  });

  it('should remove object emojis', () => {
    expect(stripEmojis('Check 📧📱💻')).toBe('Check ');
  });

  it('should remove transport emojis', () => {
    expect(stripEmojis('Going 🚗🚀✈️')).toBe('Going ');
  });

  it('should preserve text characters', () => {
    expect(stripEmojis('Hello World 123')).toBe('Hello World 123');
  });

  it('should preserve slack shortcodes', () => {
    expect(stripEmojis(':smile: :wave:')).toBe(':smile: :wave:');
  });
});

