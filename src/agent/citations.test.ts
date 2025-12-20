/**
 * Citation Module Tests
 *
 * Tests for source citation formatting and detection.
 *
 * @see Story 2.7 - Source Citations
 * @see AC#1 - Sources are cited inline or at the end of the response
 * @see AC#2 - Citations include links when available
 * @see AC#4 - Uncited factual claims are flagged during verification
 */

import { describe, it, expect } from 'vitest';
import {
  type Citation,
  formatInlineCitation,
  formatCitationFooter,
  detectUncitedClaims,
  formatSlackLink,
  FACTUAL_INDICATORS,
  detectFactualClaims,
  sourceToCitation,
  buildCitationRegistry,
} from './citations.js';
import type { Source } from './loop.js';

describe('Citation Types', () => {
  it('should support all citation source types', () => {
    const types: Citation['type'][] = [
      'thread',
      'file',
      'web',
      'confluence',
      'slack',
    ];

    types.forEach((type) => {
      const citation: Citation = {
        id: 1,
        type,
        title: `Test ${type}`,
      };
      expect(citation.type).toBe(type);
    });
  });

  it('should allow optional url and excerpt fields', () => {
    const withUrl: Citation = {
      id: 1,
      type: 'web',
      title: 'Test',
      url: 'https://example.com',
    };

    const withExcerpt: Citation = {
      id: 2,
      type: 'file',
      title: 'Test',
      excerpt: 'Some excerpt text',
    };

    const minimal: Citation = {
      id: 3,
      type: 'thread',
      title: 'Test',
    };

    expect(withUrl.url).toBe('https://example.com');
    expect(withExcerpt.excerpt).toBe('Some excerpt text');
    expect(minimal.url).toBeUndefined();
  });
});

describe('formatInlineCitation', () => {
  it('should format inline citation with number', () => {
    const citation: Citation = {
      id: 1,
      type: 'web',
      title: 'Test',
    };

    expect(formatInlineCitation(citation)).toBe('[1]');
  });

  it('should handle different citation ids', () => {
    expect(formatInlineCitation({ id: 5, type: 'file', title: 'Test' })).toBe(
      '[5]'
    );
    expect(formatInlineCitation({ id: 10, type: 'file', title: 'Test' })).toBe(
      '[10]'
    );
  });
});

describe('formatSlackLink', () => {
  it('should format URL with display text in Slack syntax', () => {
    expect(formatSlackLink('https://example.com', 'Example')).toBe(
      '<https://example.com|Example>'
    );
  });

  it('should handle URLs with special characters', () => {
    expect(
      formatSlackLink('https://example.com/path?q=test&a=1', 'Search')
    ).toBe('<https://example.com/path?q=test&a=1|Search>');
  });

  it('should handle display text with special characters', () => {
    expect(formatSlackLink('https://example.com', 'Test & Demo')).toBe(
      '<https://example.com|Test & Demo>'
    );
  });

  it('should escape pipe character in URL', () => {
    expect(formatSlackLink('https://example.com/a|b', 'Link')).toBe(
      '<https://example.com/a%7Cb|Link>'
    );
  });

  it('should escape angle brackets in display text', () => {
    expect(formatSlackLink('https://example.com', '<script>alert</script>')).toBe(
      '<https://example.com|&lt;script&gt;alert&lt;/script&gt;>'
    );
  });

  it('should replace pipe in display text with dash', () => {
    expect(formatSlackLink('https://example.com', 'A | B')).toBe(
      '<https://example.com|A - B>'
    );
  });
});

describe('formatCitationFooter', () => {
  it('should return empty string for empty citations array', () => {
    expect(formatCitationFooter([])).toBe('');
  });

  it('should format single citation without URL', () => {
    const citations: Citation[] = [
      { id: 1, type: 'thread', title: 'Thread Discussion' },
    ];

    const result = formatCitationFooter(citations);
    expect(result).toContain('_Sources:_');
    expect(result).toContain('[1] Thread Discussion');
  });

  it('should format single citation with URL as Slack link', () => {
    const citations: Citation[] = [
      {
        id: 1,
        type: 'confluence',
        title: 'Company Overview',
        url: 'https://confluence.samba.tv/page',
      },
    ];

    const result = formatCitationFooter(citations);
    expect(result).toContain('[1] <https://confluence.samba.tv/page|Company Overview>');
  });

  it('should format multiple citations', () => {
    const citations: Citation[] = [
      { id: 1, type: 'web', title: 'Web Source', url: 'https://example.com' },
      { id: 2, type: 'thread', title: 'Thread' },
      {
        id: 3,
        type: 'confluence',
        title: 'Confluence Doc',
        url: 'https://conf.example.com',
      },
    ];

    const result = formatCitationFooter(citations);
    expect(result).toContain('_Sources:_');
    expect(result).toContain('[1] <https://example.com|Web Source>');
    expect(result).toContain('[2] Thread');
    expect(result).toContain('[3] <https://conf.example.com|Confluence Doc>');
  });

  it('should use bullet points for each citation', () => {
    const citations: Citation[] = [
      { id: 1, type: 'file', title: 'File 1' },
      { id: 2, type: 'file', title: 'File 2' },
    ];

    const result = formatCitationFooter(citations);
    const lines = result.split('\n').filter((l) => l.startsWith('•'));
    expect(lines).toHaveLength(2);
  });

  it('should start footer with newlines for separation', () => {
    const citations: Citation[] = [{ id: 1, type: 'web', title: 'Test' }];

    const result = formatCitationFooter(citations);
    expect(result.startsWith('\n\n')).toBe(true);
  });
});

describe('detectUncitedClaims', () => {
  it('should detect no uncited claims when no sources gathered', () => {
    const result = detectUncitedClaims('Any response text', []);
    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(0);
  });

  it('should detect uncited claims when sources gathered but no citations', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source', url: 'https://example.com' },
    ];

    const result = detectUncitedClaims(
      'Samba provides TV viewership data',
      sources
    );
    expect(result.hasUncitedClaims).toBe(true);
    expect(result.citationCount).toBe(0);
  });

  it('should not flag uncited claims when citations are present', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source', url: 'https://example.com' },
    ];

    const result = detectUncitedClaims(
      'Samba provides TV viewership data [1]',
      sources
    );
    expect(result.hasUncitedClaims).toBe(false);
    expect(result.citationCount).toBe(1);
  });

  it('should count unique citations correctly', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source 1' },
      { id: 2, type: 'web', title: 'Source 2' },
    ];

    const result = detectUncitedClaims(
      'First fact [1] and second fact [2]. Also [1] again.',
      sources
    );
    expect(result.citationCount).toBe(2); // Only unique citations
  });

  it('should handle multiple different citation markers', () => {
    const sources: Citation[] = [
      { id: 1, type: 'web', title: 'Source 1' },
      { id: 2, type: 'web', title: 'Source 2' },
      { id: 3, type: 'web', title: 'Source 3' },
    ];

    const result = detectUncitedClaims(
      'Fact one [1], fact two [2], fact three [3].',
      sources
    );
    expect(result.citationCount).toBe(3);
    expect(result.hasUncitedClaims).toBe(false);
  });

  it('should handle double-digit citation markers', () => {
    const sources = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      type: 'web' as const,
      title: `Source ${i + 1}`,
    }));

    const result = detectUncitedClaims('Reference [10] and [11] and [12]', sources);
    expect(result.citationCount).toBe(3);
  });
});

describe('FACTUAL_INDICATORS', () => {
  it('should detect years', () => {
    expect(FACTUAL_INDICATORS.some((p) => p.test('In 2023, the company...'))).toBe(
      true
    );
    expect(FACTUAL_INDICATORS.some((p) => p.test('Founded in 1999'))).toBe(true);
  });

  it('should detect percentages', () => {
    expect(FACTUAL_INDICATORS.some((p) => p.test('Grew by 50%'))).toBe(true);
    expect(FACTUAL_INDICATORS.some((p) => p.test('A 100% increase'))).toBe(true);
  });

  it('should detect dollar amounts', () => {
    expect(FACTUAL_INDICATORS.some((p) => p.test('Revenue of $1,000,000'))).toBe(
      true
    );
    expect(FACTUAL_INDICATORS.some((p) => p.test('Worth $50'))).toBe(true);
  });

  it('should detect attribution phrases', () => {
    expect(
      FACTUAL_INDICATORS.some((p) => p.test('According to the report...'))
    ).toBe(true);
    expect(FACTUAL_INDICATORS.some((p) => p.test('Studies show that...'))).toBe(
      true
    );
    expect(FACTUAL_INDICATORS.some((p) => p.test('Research indicates...'))).toBe(
      true
    );
  });

  it('should not match regular text', () => {
    const regularText = 'This is a regular sentence without factual indicators.';
    expect(FACTUAL_INDICATORS.every((p) => !p.test(regularText))).toBe(true);
  });
});

describe('detectFactualClaims', () => {
  it('should detect years as factual claims', () => {
    expect(detectFactualClaims('The company was founded in 2020.')).toBe(true);
  });

  it('should detect percentages as factual claims', () => {
    expect(detectFactualClaims('Revenue grew by 50% last quarter.')).toBe(true);
  });

  it('should detect dollar amounts as factual claims', () => {
    expect(detectFactualClaims('The project cost $1,000,000.')).toBe(true);
  });

  it('should detect attribution phrases', () => {
    expect(detectFactualClaims('According to the report, sales increased.')).toBe(true);
    expect(detectFactualClaims('Studies show this is effective.')).toBe(true);
  });

  it('should return false for regular text without factual claims', () => {
    expect(detectFactualClaims('Hello, how can I help you today?')).toBe(false);
    expect(detectFactualClaims('Let me look into that for you.')).toBe(false);
  });
});

describe('sourceToCitation', () => {
  it('should convert thread source to citation', () => {
    const source: Source = {
      type: 'thread',
      reference: 'Thread 1234567890.123456',
      excerpt: 'Some thread content',
    };

    const citation = sourceToCitation(source, 1);
    expect(citation.id).toBe(1);
    expect(citation.type).toBe('thread');
    expect(citation.title).toBe('Thread 1234567890.123456');
    expect(citation.excerpt).toBe('Some thread content');
    expect(citation.url).toBeUndefined();
  });

  it('should convert file source to citation', () => {
    const source: Source = {
      type: 'file',
      reference: 'orion-context/knowledge/company-info.md',
      excerpt: 'Company overview...',
    };

    const citation = sourceToCitation(source, 2);
    expect(citation.id).toBe(2);
    expect(citation.type).toBe('file');
    expect(citation.title).toBe('orion-context/knowledge/company-info.md');
  });

  it('should convert web source to citation with URL', () => {
    const source: Source = {
      type: 'web',
      reference: 'https://example.com/article',
      excerpt: 'Article content',
    };

    const citation = sourceToCitation(source, 3);
    expect(citation.id).toBe(3);
    expect(citation.type).toBe('web');
    expect(citation.title).toBe('https://example.com/article');
    expect(citation.url).toBe('https://example.com/article');
  });

  it('should convert tool source to citation', () => {
    const source: Source = {
      type: 'tool',
      reference: 'confluence-search: Company Policies',
      excerpt: 'Policy document...',
    };

    const citation = sourceToCitation(source, 4);
    expect(citation.id).toBe(4);
    expect(citation.type).toBe('confluence'); // Tool type inferred from reference
    expect(citation.title).toBe('Company Policies');
  });

  it('should detect Slack tool source', () => {
    const source: Source = {
      type: 'tool',
      reference: 'slack-search: #general channel',
    };

    const citation = sourceToCitation(source, 1);
    expect(citation.type).toBe('slack');
    expect(citation.title).toBe('#general channel');
  });

  it('should extract URL from confluence tool source with URL in parens', () => {
    const source: Source = {
      type: 'tool',
      reference: 'confluence: Company Policies (https://confluence.example.com/wiki/policies)',
    };

    const citation = sourceToCitation(source, 1);
    expect(citation.type).toBe('confluence');
    expect(citation.title).toBe('Company Policies');
    expect(citation.url).toBe('https://confluence.example.com/wiki/policies');
  });

  it('should extract URL from slack tool source with URL in parens', () => {
    const source: Source = {
      type: 'tool',
      reference: 'slack: #engineering (https://slack.com/archives/C12345)',
    };

    const citation = sourceToCitation(source, 1);
    expect(citation.type).toBe('slack');
    expect(citation.title).toBe('#engineering');
    expect(citation.url).toBe('https://slack.com/archives/C12345');
  });

  it('should extract URL from reference with URL after colon', () => {
    const source: Source = {
      type: 'web',
      reference: 'https://docs.example.com/api',
    };

    const citation = sourceToCitation(source, 1);
    expect(citation.url).toBe('https://docs.example.com/api');
  });
});

describe('buildCitationRegistry', () => {
  it('should return empty registry for empty sources', () => {
    const registry = buildCitationRegistry([]);
    expect(registry.citations).toHaveLength(0);
    expect(registry.citationMap.size).toBe(0);
  });

  it('should build registry with sequential IDs', () => {
    const sources: Source[] = [
      { type: 'thread', reference: 'Thread 1' },
      { type: 'file', reference: 'file.md' },
      { type: 'web', reference: 'https://example.com' },
    ];

    const registry = buildCitationRegistry(sources);
    expect(registry.citations).toHaveLength(3);
    expect(registry.citations[0].id).toBe(1);
    expect(registry.citations[1].id).toBe(2);
    expect(registry.citations[2].id).toBe(3);
  });

  it('should create citation map for quick lookup', () => {
    const sources: Source[] = [
      { type: 'thread', reference: 'Thread 1' },
      { type: 'file', reference: 'file.md' },
    ];

    const registry = buildCitationRegistry(sources);
    expect(registry.citationMap.get('Thread 1')).toBeDefined();
    expect(registry.citationMap.get('Thread 1')?.id).toBe(1);
    expect(registry.citationMap.get('file.md')?.id).toBe(2);
  });

  it('should deduplicate sources with same reference', () => {
    const sources: Source[] = [
      { type: 'thread', reference: 'Thread 1' },
      { type: 'thread', reference: 'Thread 1' }, // Duplicate
      { type: 'file', reference: 'file.md' },
    ];

    const registry = buildCitationRegistry(sources);
    expect(registry.citations).toHaveLength(2);
    expect(registry.citations[0].title).toBe('Thread 1');
    expect(registry.citations[1].title).toBe('file.md');
  });
});

