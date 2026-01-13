/**
 * Tests for Citation Parser Module (Story 8.1)
 *
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#1 - Anthropic Citations API Integration
 * @see AC#7 - Unit tests for citation parsing logic
 */

import { describe, it, expect } from 'vitest';
import {
  extractCitations,
  parseCitationsWithMetadata,
  truncateCitedText,
  deduplicateCitations,
  countCitationsByDocument,
  isCiteBlock,
} from '@/slack/citations/parser.js';
import type { DocumentCitation, DocumentMetadata } from '@/slack/citations/types.js';

describe('isCiteBlock', () => {
  it('returns true for valid cite block', () => {
    const block = {
      type: 'cite',
      cited_text: 'Q3 revenue grew 12% YoY',
      document_index: 0,
      start_char_index: 45,
      end_char_index: 71,
    };
    expect(isCiteBlock(block)).toBe(true);
  });

  it('returns false for text block', () => {
    const block = {
      type: 'text',
      text: 'Hello world',
    };
    expect(isCiteBlock(block)).toBe(false);
  });

  it('returns false for tool_use block', () => {
    const block = {
      type: 'tool_use',
      id: 'tool_123',
      name: 'search',
      input: {},
    };
    expect(isCiteBlock(block)).toBe(false);
  });

  it('returns false for cite block with missing fields', () => {
    const block = {
      type: 'cite',
      cited_text: 'Some text',
      // missing document_index, start_char_index, end_char_index
    };
    expect(isCiteBlock(block)).toBe(false);
  });

  it('returns false for cite block with wrong field types', () => {
    const block = {
      type: 'cite',
      cited_text: 123 as unknown as string, // should be string
      document_index: '0' as unknown as number, // should be number
      start_char_index: 0,
      end_char_index: 10,
    };
    expect(isCiteBlock(block)).toBe(false);
  });
});

describe('extractCitations', () => {
  it('extracts single citation from content array', () => {
    const content = [
      { type: 'text', text: 'According to the report [1], revenue grew...' },
      {
        type: 'cite',
        cited_text: 'Q3 revenue grew 12% YoY',
        document_index: 0,
        start_char_index: 45,
        end_char_index: 71,
      },
    ];

    const citations = extractCitations(content);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toEqual({
      type: 'cite',
      cited_text: 'Q3 revenue grew 12% YoY',
      document_index: 0,
      start_char_index: 45,
      end_char_index: 71,
    });
  });

  it('extracts multiple citations from content array', () => {
    const content = [
      { type: 'text', text: 'Multiple findings [1][2]...' },
      {
        type: 'cite',
        cited_text: 'Revenue grew',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 12,
      },
      {
        type: 'cite',
        cited_text: 'Retention improved',
        document_index: 1,
        start_char_index: 20,
        end_char_index: 38,
      },
    ];

    const citations = extractCitations(content);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.cited_text).toBe('Revenue grew');
    expect(citations[1]?.cited_text).toBe('Retention improved');
  });

  it('returns empty array when no citations exist', () => {
    const content = [
      { type: 'text', text: 'No citations here.' },
      { type: 'tool_use', id: 'tool_123', name: 'search', input: {} },
    ];

    const citations = extractCitations(content);

    expect(citations).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(extractCitations([])).toEqual([]);
  });

  it('returns empty array for null/undefined content', () => {
    expect(extractCitations(null as unknown as [])).toEqual([]);
    expect(extractCitations(undefined as unknown as [])).toEqual([]);
  });

  it('skips malformed cite blocks', () => {
    const content = [
      {
        type: 'cite',
        cited_text: 'Valid citation',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 14,
      },
      {
        type: 'cite',
        // missing required fields
        cited_text: 'Invalid',
      },
    ];

    const citations = extractCitations(content);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.cited_text).toBe('Valid citation');
  });

  it('handles interleaved text and cite blocks', () => {
    const content = [
      { type: 'text', text: 'First point [1]' },
      {
        type: 'cite',
        cited_text: 'Citation 1',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 10,
      },
      { type: 'text', text: ' and second point [2]' },
      {
        type: 'cite',
        cited_text: 'Citation 2',
        document_index: 0,
        start_char_index: 50,
        end_char_index: 60,
      },
      { type: 'text', text: ' conclusion.' },
    ];

    const citations = extractCitations(content);

    expect(citations).toHaveLength(2);
  });
});

describe('parseCitationsWithMetadata', () => {
  it('enriches citations with document metadata', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Revenue data',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 12,
      },
    ];

    const metadata: DocumentMetadata[] = [
      { index: 0, name: 'MSCI_Report.pdf', page: 5 },
    ];

    const parsed = parseCitationsWithMetadata(citations, metadata);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: 'cite',
      cited_text: 'Revenue data',
      document_name: 'MSCI_Report.pdf',
      page_number: 5,
    });
  });

  it('uses placeholder name when metadata not found', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Some text',
        document_index: 2,
        start_char_index: 0,
        end_char_index: 9,
      },
    ];

    const metadata: DocumentMetadata[] = [
      { index: 0, name: 'First.pdf' },
    ];

    const parsed = parseCitationsWithMetadata(citations, metadata);

    expect(parsed[0]?.document_name).toBe('Document 3'); // 0-indexed + 1
  });

  it('handles citations from multiple documents', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'From doc 0',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 10,
      },
      {
        type: 'cite',
        cited_text: 'From doc 1',
        document_index: 1,
        start_char_index: 0,
        end_char_index: 10,
      },
    ];

    const metadata: DocumentMetadata[] = [
      { index: 0, name: 'Report_A.pdf' },
      { index: 1, name: 'Report_B.pdf', page: 12 },
    ];

    const parsed = parseCitationsWithMetadata(citations, metadata);

    expect(parsed[0]?.document_name).toBe('Report_A.pdf');
    expect(parsed[0]?.page_number).toBeUndefined();
    expect(parsed[1]?.document_name).toBe('Report_B.pdf');
    expect(parsed[1]?.page_number).toBe(12);
  });

  it('handles empty citations array', () => {
    const parsed = parseCitationsWithMetadata([], []);
    expect(parsed).toEqual([]);
  });

  it('handles empty metadata array', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Text',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 4,
      },
    ];

    const parsed = parseCitationsWithMetadata(citations, []);

    expect(parsed[0]?.document_name).toBe('Document 1');
  });
});

describe('truncateCitedText', () => {
  it('returns full text when under max length', () => {
    const text = 'Short text';
    expect(truncateCitedText(text, 50)).toBe('Short text');
  });

  it('returns full text when exactly at max length', () => {
    const text = '12345678901234567890'; // 20 chars
    expect(truncateCitedText(text, 20)).toBe(text);
  });

  it('truncates with ellipsis when over max length', () => {
    const text = 'This is a longer piece of text that needs to be truncated';
    const result = truncateCitedText(text, 20);
    expect(result).toBe('This is a longer ...');
    expect(result.length).toBe(20);
  });

  it('uses default max length of 50', () => {
    const text = 'A'.repeat(60);
    const result = truncateCitedText(text);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateCitedText('')).toBe('');
  });

  it('handles very short max length', () => {
    const text = 'Hello world';
    const result = truncateCitedText(text, 5);
    expect(result).toBe('He...');
  });
});

describe('deduplicateCitations', () => {
  it('removes duplicate citations', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Same text',
        document_index: 0,
        start_char_index: 10,
        end_char_index: 20,
      },
      {
        type: 'cite',
        cited_text: 'Same text',
        document_index: 0,
        start_char_index: 10,
        end_char_index: 20,
      },
    ];

    const deduped = deduplicateCitations(citations);

    expect(deduped).toHaveLength(1);
  });

  it('preserves unique citations', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'First',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 5,
      },
      {
        type: 'cite',
        cited_text: 'Second',
        document_index: 0,
        start_char_index: 10,
        end_char_index: 16,
      },
      {
        type: 'cite',
        cited_text: 'Third',
        document_index: 1,
        start_char_index: 0,
        end_char_index: 5,
      },
    ];

    const deduped = deduplicateCitations(citations);

    expect(deduped).toHaveLength(3);
  });

  it('differentiates by document_index', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Same positions',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 10,
      },
      {
        type: 'cite',
        cited_text: 'Same positions',
        document_index: 1,
        start_char_index: 0,
        end_char_index: 10,
      },
    ];

    const deduped = deduplicateCitations(citations);

    expect(deduped).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(deduplicateCitations([])).toEqual([]);
  });
});

describe('countCitationsByDocument', () => {
  it('counts citations per document', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'A',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 1,
      },
      {
        type: 'cite',
        cited_text: 'B',
        document_index: 0,
        start_char_index: 5,
        end_char_index: 6,
      },
      {
        type: 'cite',
        cited_text: 'C',
        document_index: 1,
        start_char_index: 0,
        end_char_index: 1,
      },
    ];

    const counts = countCitationsByDocument(citations);

    expect(counts.get(0)).toBe(2);
    expect(counts.get(1)).toBe(1);
  });

  it('returns empty map for empty citations', () => {
    const counts = countCitationsByDocument([]);
    expect(counts.size).toBe(0);
  });

  it('handles single document', () => {
    const citations: DocumentCitation[] = [
      {
        type: 'cite',
        cited_text: 'Only one',
        document_index: 5,
        start_char_index: 0,
        end_char_index: 8,
      },
    ];

    const counts = countCitationsByDocument(citations);

    expect(counts.size).toBe(1);
    expect(counts.get(5)).toBe(1);
  });
});
