/**
 * Tests for Sources Block Kit Module (Story 2.7)
 *
 * @see Story 2.7 - Source Citations
 */

import { describe, it, expect } from 'vitest';
import { createSourcesContextBlock, type SourceCitation } from './sources-block.js';

describe('createSourcesContextBlock', () => {
  it('returns null for empty sources array', () => {
    const result = createSourcesContextBlock([]);
    expect(result).toBeNull();
  });

  it('creates context block with single source', () => {
    const sources: SourceCitation[] = [{ id: 1, title: 'Test Source' }];

    const result = createSourcesContextBlock(sources);

    expect(result).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '📎 *Sources:* [1] Test Source',
        },
      ],
    });
  });

  it('creates context block with multiple sources', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'First Source' },
      { id: 2, title: 'Second Source' },
      { id: 3, title: 'Third Source' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '📎 *Sources:* [1] First Source | [2] Second Source | [3] Third Source',
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
      '📎 *Sources:* [1] <https://confluence.samba.tv/page|Company Overview>'
    );
  });

  it('sanitizes titles/urls so they cannot break Slack link syntax', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Hello|World > <', url: 'https://example.com/a|b>c<d' },
    ];

    const result = createSourcesContextBlock(sources);
    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:* [1] <https://example.com/a%7Cb%3Ec%3Cd|Hello¦World › ‹>'
    );
  });

  it('handles mix of sources with and without URLs', () => {
    const sources: SourceCitation[] = [
      { id: 1, title: 'Linked Source', url: 'https://example.com' },
      { id: 2, title: 'Plain Source' },
      { id: 3, title: 'Another Link', url: 'https://docs.example.com' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:* [1] <https://example.com|Linked Source> | [2] Plain Source | [3] <https://docs.example.com|Another Link>'
    );
  });

  it('preserves citation IDs from input', () => {
    const sources: SourceCitation[] = [
      { id: 5, title: 'Source Five' },
      { id: 10, title: 'Source Ten' },
    ];

    const result = createSourcesContextBlock(sources);

    expect(result?.elements[0]?.text).toBe(
      '📎 *Sources:* [5] Source Five | [10] Source Ten'
    );
  });
});

