/**
 * Tests for verify phase contract (Story 2.2).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#5 - Verification result produced and logged (contract)
 */

import { describe, it, expect } from 'vitest';

import { verify } from './verify.js';

describe('verify', () => {
  it('should fail empty responses', () => {
    const result = verify('');
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.feedback.length).toBeGreaterThan(0);
  });

  it('should flag Markdown bold (**bold**) as invalid for Slack', () => {
    const result = verify('This is **bold**');
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('Slack');
  });

  it('should flag Markdown links [text](url) as invalid for Slack', () => {
    const result = verify('See [docs](https://example.com)');
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('Slack');
  });

  it('should flag blockquotes (lines starting with ">") as invalid for Slack', () => {
    const result = verify('Here is a quote:\n> This is quoted text');
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('blockquote');
  });

  it('should pass valid Slack-formatted responses', () => {
    const result = verify('This is *bold* and _italic_ with <https://example.com|a link>');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});


