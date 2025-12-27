/**
 * Tests for Citation Module (Story 2.7)
 *
 * @see Story 2.7 - Source Citations
 * @see FR6 - System cites sources for factual claims
 */

import { describe, it, expect } from 'vitest';
import {
  formatSlackLink,
  formatCitationLink,
  formatCitationFooter,
  detectUncitedClaims,
  FACTUAL_INDICATORS,
  type Citation,
} from './citations.js';

describe('formatCitationLink', () => {
  it('returns Slack link format when URL is provided', () => {
    const citation: Citation = {
      id: 1,
      type: 'web',
      title: 'Company Overview',
      url: 'https://confluence.samba.tv/page',
    };

    expect(formatCitationLink(citation)).toBe(
      '<https://confluence.samba.tv/page|Company Overview>'
    );
  });

  it('returns plain title when URL is not provided', () => {
    const citation: Citation = {
      id: 1,
      type: 'thread',
      title: 'Thread message',
    };

    expect(formatCitationLink(citation)).toBe('Thread message');
  });

  it('handles empty URL as no URL', () => {
    const citation: Citation = {
      id: 1,
      type: 'file',
      title: 'Local File',
      url: '',
    };

    // Empty string is falsy, should return plain title
    expect(formatCitationLink(citation)).toBe('Local File');
  });

  it('sanitizes link text so it cannot break Slack link syntax', () => {
    const citation: Citation = {
      id: 1,
      type: 'web',
      title: 'Title | with > tricky < chars',
      url: 'https://example.com/a|b>c<d',
    };

    expect(formatCitationLink(citation)).toBe(
      '<https://example.com/a%7Cb%3Ec%3Cd|Title ¦ with › tricky ‹ chars>'
    );
  });
});

describe('formatSlackLink', () => {
  it('formats Slack mrkdwn link with sanitization', () => {
    expect(
      formatSlackLink({ url: ' https://example.com/a|b ', text: 'Hello|World' })
    ).toBe('<https://example.com/a%7Cb|Hello¦World>');
  });
});

describe('formatCitationFooter', () => {
  it('returns empty string for empty citations array', () => {
    expect(formatCitationFooter([])).toBe('');
  });

  it('formats single citation correctly', () => {
    const citations: Citation[] = [
      { id: 1, type: 'web', title: 'Source One', url: 'https://example.com' },
    ];

    const result = formatCitationFooter(citations);

    expect(result).toBe(
      '\n\n_Sources:_\n• [1] <https://example.com|Source One>'
    );
  });

  it('formats multiple citations correctly', () => {
    const citations: Citation[] = [
      { id: 1, type: 'web', title: 'First Source', url: 'https://first.com' },
      { id: 2, type: 'thread', title: 'Thread Message' },
      { id: 3, type: 'file', title: 'Local Doc', url: 'https://docs.com/file' },
    ];

    const result = formatCitationFooter(citations);

    expect(result).toContain('_Sources:_');
    expect(result).toContain('• [1] <https://first.com|First Source>');
    expect(result).toContain('• [2] Thread Message');
    expect(result).toContain('• [3] <https://docs.com/file|Local Doc>');
  });

  it('preserves citation IDs from input', () => {
    const citations: Citation[] = [
      { id: 5, type: 'web', title: 'Source Five' },
      { id: 10, type: 'web', title: 'Source Ten' },
    ];

    const result = formatCitationFooter(citations);

    expect(result).toContain('[5] Source Five');
    expect(result).toContain('[10] Source Ten');
  });
});

describe('detectUncitedClaims', () => {
  it('returns no uncited claims when no sources were gathered', () => {
    const result = detectUncitedClaims(
      'This is a response without any context.',
      []
    );

    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(0);
    expect(result.citedIds).toEqual([]);
  });

  it('detects uncited claims when sources gathered but no citations in response', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source One' },
      { id: 2, type: 'thread', title: 'Source Two' },
    ];

    const result = detectUncitedClaims(
      'This response has no citation markers.',
      sources
    );

    expect(result.hasUncitedClaims).toBe(true);
    expect(result.citationCount).toBe(0);
    expect(result.citedIds).toEqual([]);
  });

  it('counts inline citation markers correctly', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source One' },
      { id: 2, type: 'thread', title: 'Source Two' },
    ];

    const result = detectUncitedClaims(
      'SambaTV provides TV viewership data [1]. The company was founded in 2008 [2].',
      sources
    );

    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(2);
    expect(result.citedIds).toEqual([1, 2]);
  });

  it('handles duplicate citation markers', () => {
    const sources: Citation[] = [{ id: 1, type: 'web', title: 'Source One' }];

    const result = detectUncitedClaims(
      'Point one [1] and point two [1] and point three [1].',
      sources
    );

    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(1); // Unique count
    expect(result.citedIds).toEqual([1]);
  });

  it('handles multiple different citation markers', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source One' },
      { id: 2, type: 'web', title: 'Source Two' },
      { id: 3, type: 'web', title: 'Source Three' },
    ];

    const result = detectUncitedClaims(
      'Fact from [1], another from [3], and [1] again.',
      sources
    );

    expect(result.citationCount).toBe(2); // Unique: 1 and 3
    expect(result.citedIds).toContain(1);
    expect(result.citedIds).toContain(3);
    expect(result.citedIds).not.toContain(2);
  });

  it('ignores invalid citation formats', () => {
    const sources: Citation[] = [{ id: 1, type: 'web', title: 'Source One' }];

    const result = detectUncitedClaims(
      'This has [abc] and [0] and [ 1 ] but not valid [1].',
      sources
    );

    // Only [1] should be counted, [0] is filtered out by > 0 check
    expect(result.citationCount).toBe(1);
    expect(result.citedIds).toEqual([1]);
  });

  it('handles response with only partial citations', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source One' },
      { id: 2, type: 'web', title: 'Source Two' },
      { id: 3, type: 'web', title: 'Source Three' },
    ];

    const result = detectUncitedClaims(
      'Only citing source [1] here.',
      sources
    );

    // Has at least one citation, so not flagged as uncited
    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(1);
  });
});

describe('FACTUAL_INDICATORS', () => {
  it('contains patterns for years', () => {
    const yearPattern = FACTUAL_INDICATORS.find((p) => p.test('In 2023'));
    expect(yearPattern).toBeDefined();
  });

  it('contains patterns for percentages', () => {
    const percentPattern = FACTUAL_INDICATORS.find((p) => p.test('increased by 50%'));
    expect(percentPattern).toBeDefined();
  });

  it('contains patterns for dollar amounts', () => {
    const dollarPattern = FACTUAL_INDICATORS.find((p) => p.test('costs $1,000'));
    expect(dollarPattern).toBeDefined();
  });

  it('contains patterns for attribution phrases', () => {
    const attributionPattern = FACTUAL_INDICATORS.find((p) =>
      p.test('According to the report')
    );
    expect(attributionPattern).toBeDefined();
  });
});

