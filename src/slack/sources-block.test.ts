/**
 * Tests for Sources Block Kit Module (Story 2.7)
 *
 * Updated for Source Citations Fix: "clickable sources only" policy.
 * Sources without URLs are filtered out (except memory sources).
 *
 * @see Story 2.7 - Source Citations
 * @see Tech-Spec: Source Citations Fix
 */

import { describe, it, expect } from 'vitest';
import { createSourcesContextBlock, type SourceCitation } from './sources-block.js';

describe('createSourcesContextBlock', () => {
  it('returns null for empty sources array', () => {
    const result = createSourcesContextBlock([]);
    expect(result).toBeNull();
  });

  it('returns null when all sources lack URLs (clickable sources only)', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'No URL Source' },
      { id: 2, title: 'Also No URL' },
    ];

    const result = createSourcesContextBlock(sources);
    expect(result).toBeNull();
  });

  it('creates context block with source that has URL', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Test Source', url: 'https://example.com' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '📎 *Sources:*\n[1] <https://example.com|Test Source>',
        },
      ],
    });
  });

  it('creates context block with multiple clickable sources', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'First Source', url: 'https://example.com/1' },
      { id: 2, title: 'Second Source', url: 'https://example.com/2' },
      { id: 3, title: 'Third Source', url: 'https://example.com/3' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '📎 *Sources:*\n[1] <https://example.com/1|First Source>\n[2] <https://example.com/2|Second Source>\n[3] <https://example.com/3|Third Source>',
        },
      ],
    });
  });

  it('formats source with URL as Slack link', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Company Overview', url: 'https://confluence.samba.tv/page' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://confluence.samba.tv/page|Company Overview>'
    );
  });

  it('sanitizes titles/urls so they cannot break Slack link syntax', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Hello|World > <', url: 'https://example.com/a|b>c<d' },
    ];

    const result = createSourcesContextBlock(sources);
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://example.com/a%7Cb%3Ec%3Cd|Hello¦World › ‹>'
    );
  });

  it('filters out sources without URLs and renumbers', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Linked Source', url: 'https://example.com' },
      { id: 2, title: 'Plain Source' }, // No URL - filtered out
      { id: 3, title: 'Another Link', url: 'https://docs.example.com' },
    ];

    const result = createSourcesContextBlock(sources);

    // Only sources with URLs rendered, renumbered [1], [2]
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://example.com|Linked Source>\n[2] <https://docs.example.com|Another Link>'
    );
  });

  it('renumbers sources based on filtered list', () => {
    const sources: SourceCitation[] = [
      { id: 5, title: 'Source Five', url: 'https://example.com/5' },
      { id: 10, title: 'Source Ten', url: 'https://example.com/10' },
    ];

    const result = createSourcesContextBlock(sources);

    // IDs are renumbered based on position in filtered list
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://example.com/5|Source Five>\n[2] <https://example.com/10|Source Ten>'
    );
  });

  it('allows memory sources without URLs (implicit trust)', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'From your preferences', isMemory: true },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] From your preferences'
    );
  });

  it('includes both memory sources and URL sources', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Thread message', url: 'https://slack.com/archives/C123/p456' },
      { id: 2, title: 'Your preferences', isMemory: true },
      { id: 3, title: 'No URL' }, // Filtered out
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://slack.com/archives/C123/p456|Thread message>\n[2] Your preferences'
    );
  });

  it('includes tool sources without URLs', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'MSCI Reports: Search Reports', isTool: true, toolContext: 'Hulu' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] 🔧 MSCI Reports: Search Reports — _Hulu_'
    );
  });

  it('includes tool sources with longer context (truncated to 50 chars)', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Audience Manager: Search', isTool: true, toolContext: 'NFL football audiences in major markets with demographic analysis' },
    ];

    const result = createSourcesContextBlock(sources);

    // Context is truncated to 50 chars in formatSourceLink
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] 🔧 Audience Manager: Search — _NFL football audiences in major markets with demog_'
    );
  });

  it('includes tool sources without context', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Some Tool', isTool: true },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] 🔧 Some Tool'
    );
  });

  it('mixes URL, memory, and tool sources correctly', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Web result', url: 'https://example.com' },
      { id: 2, title: 'MSCI Reports', isTool: true, toolContext: 'Search query' },
      { id: 3, title: 'Your preferences', isMemory: true },
      { id: 4, title: 'No category' }, // Filtered out
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] <https://example.com|Web result>\n[2] 🔧 MSCI Reports — _Search query_\n[3] Your preferences'
    );
  });

  // Source Citations v2: Tool sources with URLs should NOT appear in footer
  // (Claude cites URLs inline in response)
  it('excludes tool sources WITH URLs from footer (v2 fix)', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Exa Result', isTool: true, url: 'https://lmarena.ai' }, // Should be excluded
      { id: 2, title: 'Audience Manager', isTool: true, toolContext: 'college football' }, // Should be included
    ];

    const result = createSourcesContextBlock(sources);

    // Only the tool source WITHOUT URL should appear
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:*\n[1] 🔧 Audience Manager — _college football_'
    );
  });

  it('returns null when all tool sources have URLs (v2 fix)', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Exa Web Search', isTool: true, url: 'https://example.com/1' },
      { id: 2, title: 'Another Tool', isTool: true, url: 'https://example.com/2' },
    ];

    const result = createSourcesContextBlock(sources);

    // All filtered out since they have URLs
    expect(result).toBeNull();
  });
});
