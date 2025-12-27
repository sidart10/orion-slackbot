/**
 * Tests for Response Verification Module (Story 2.3)
 *
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#1 - Retry with structured feedback
 * @see AC#4 - Graceful failure response
 */

import { describe, it, expect } from 'vitest';

import {
  verifyResponse,
  createGracefulFailureResponse,
  buildRetryPrompt,
  MAX_VERIFICATION_ATTEMPTS,
  type VerificationContext,
} from './verification.js';

describe('verifyResponse', () => {
  const baseContext: VerificationContext = {
    userMessage: 'What is the weather today?',
    hasSources: false,
  };

  describe('EMPTY_RESPONSE rule', () => {
    it('should fail empty responses', () => {
      const result = verifyResponse('', baseContext);
      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'EMPTY_RESPONSE', severity: 'error' })
      );
    });

    it('should fail whitespace-only responses', () => {
      const result = verifyResponse('   \n\t  ', baseContext);
      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'EMPTY_RESPONSE' })
      );
    });
  });

  describe('MARKDOWN_BOLD rule', () => {
    it('should fail Markdown bold (**bold**)', () => {
      const result = verifyResponse('This is **bold** text', baseContext);
      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'MARKDOWN_BOLD', severity: 'error' })
      );
    });

    it('should pass Slack mrkdwn bold (*bold*)', () => {
      const result = verifyResponse(
        'This is *bold* and _italic_ text about weather today',
        baseContext
      );
      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ code: 'MARKDOWN_BOLD' })
      );
    });
  });

  describe('MARKDOWN_LINK rule', () => {
    it('should fail Markdown links [text](url)', () => {
      const result = verifyResponse(
        'See [docs](https://example.com) for weather info',
        baseContext
      );
      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'MARKDOWN_LINK', severity: 'error' })
      );
    });

    it('should pass Slack mrkdwn links <url|text>', () => {
      const result = verifyResponse(
        'See <https://example.com|docs> for weather info today',
        baseContext
      );
      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ code: 'MARKDOWN_LINK' })
      );
    });
  });

  describe('BLOCKQUOTE rule', () => {
    it('should fail blockquotes (lines starting with >)', () => {
      const result = verifyResponse(
        'Here is a quote:\n> This is quoted weather text',
        baseContext
      );
      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'BLOCKQUOTE', severity: 'error' })
      );
    });
  });

  describe('ADDRESSES_QUESTION rule', () => {
    it('should warn when response does not address the question', () => {
      const result = verifyResponse(
        'Hello! I am here to help you with anything.',
        { userMessage: 'How do I configure the database connection?', hasSources: false }
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'ADDRESSES_QUESTION', severity: 'warning' })
      );
    });

    it('should pass when response contains question keywords', () => {
      const result = verifyResponse(
        'To configure the database connection, you need to set the DB_HOST variable.',
        { userMessage: 'How do I configure the database connection?', hasSources: false }
      );
      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ code: 'ADDRESSES_QUESTION' })
      );
    });
  });

  describe('CITES_SOURCES rule', () => {
    it('should warn when sources exist but are not cited', () => {
      const result = verifyResponse(
        'The weather is sunny today with temperatures around 75F.',
        { userMessage: 'What is the weather?', hasSources: true }
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'CITES_SOURCES', severity: 'warning' })
      );
    });

    it('should pass when sources are cited', () => {
      const result = verifyResponse(
        'It is sunny today [1].',
        { userMessage: 'What is the weather?', hasSources: true }
      );
      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ code: 'CITES_SOURCES' })
      );
    });

    it('should pass when no sources exist', () => {
      const result = verifyResponse(
        'The weather is typically sunny in California.',
        { userMessage: 'What is the weather?', hasSources: false }
      );
      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ code: 'CITES_SOURCES' })
      );
    });
  });

  describe('overall verification', () => {
    it('should pass valid Slack-formatted responses', () => {
      const result = verifyResponse(
        'This is *bold* and _italic_ with <https://example.com|a link> about the weather today',
        baseContext
      );
      expect(result.passed).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('should include structured feedback in result', () => {
      const result = verifyResponse('**bad** formatting', baseContext);
      expect(result.feedback).toContain('MARKDOWN_BOLD');
    });

    it('should pass when only warnings exist (no errors)', () => {
      const result = verifyResponse(
        'ok', // Short but not empty
        { userMessage: 'Tell me about quantum physics', hasSources: false }
      );
      // May have MINIMUM_LENGTH warning but should still pass
      const hasErrors = result.issues.some((i) => i.severity === 'error');
      expect(result.passed).toBe(!hasErrors);
    });
  });
});

describe('createGracefulFailureResponse', () => {
  it('should return UX-spec compliant error message (Story 2.4)', () => {
    const response = createGracefulFailureResponse(3, [
      { code: 'MARKDOWN_BOLD', message: 'Use Slack bold', severity: 'error' },
    ]);

    // Must follow UX-spec Error with Alternative pattern
    expect(response).toMatch(/^⚠️/); // Starts with warning emoji
    expect(response).toContain("*Couldn't verify my response*");
    expect(response).toContain('*What I can do instead:*');
  });

  it('should include alternatives with 💡 emoji', () => {
    const response = createGracefulFailureResponse(3, [
      { code: 'EMPTY_RESPONSE', message: 'Response was empty', severity: 'error' },
      { code: 'ADDRESSES_QUESTION', message: 'Does not address question', severity: 'warning' },
    ]);

    // UX-spec requires at least 2 alternatives with 💡
    const alternatives = (response.match(/💡/g) || []).length;
    expect(alternatives).toBeGreaterThanOrEqual(2);
  });

  it('should use bullet points (Slack mrkdwn)', () => {
    const response = createGracefulFailureResponse(3, []);
    expect(response).toContain('•');
    expect(response).not.toContain('**'); // No markdown bold
  });
});

describe('buildRetryPrompt', () => {
  it('should include attempt number', () => {
    const prompt = buildRetryPrompt('bad response', 'MARKDOWN_BOLD', 2);
    expect(prompt).toContain('Attempt 2/3');
  });

  it('should include verification feedback', () => {
    const prompt = buildRetryPrompt('bad response', '[MARKDOWN_BOLD] Use Slack bold', 1);
    expect(prompt).toContain('[MARKDOWN_BOLD] Use Slack bold');
  });

  it('should include formatting reminders', () => {
    const prompt = buildRetryPrompt('bad', 'error', 1);
    expect(prompt).toContain('*bold*');
    expect(prompt).toContain('<url|text>');
    expect(prompt).toContain('Do NOT use markdown');
  });

  it('should truncate long responses', () => {
    const longResponse = 'x'.repeat(1000);
    const prompt = buildRetryPrompt(longResponse, 'error', 1);
    expect(prompt.length).toBeLessThan(longResponse.length + 500);
    expect(prompt).toContain('...');
  });

  it('should include the failed response', () => {
    const prompt = buildRetryPrompt('This is **bad** formatting', 'error', 1);
    expect(prompt).toContain('This is **bad** formatting');
  });
});

describe('MAX_VERIFICATION_ATTEMPTS', () => {
  it('should be 3 (AR8)', () => {
    expect(MAX_VERIFICATION_ATTEMPTS).toBe(3);
  });
});

