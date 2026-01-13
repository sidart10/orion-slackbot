/**
 * Tests for Unified References Formatter Module (Story 8.1)
 *
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#3 - Unified References Footer Block
 * @see AC#7 - Unit tests for unified references formatter
 */

import { describe, it, expect } from 'vitest';
import {
  formatReferencesBlock,
  formatToolDisplayName,
  formatToolReference,
  formatDocumentReference,
  buildUnifiedReferences,
  contextSourceToToolSource,
} from './formatter.js';
import type { ParsedCitation, ToolSource } from './types.js';

describe('formatToolDisplayName', () => {
  it('formats MCP tool name with server prefix', () => {
    const result = formatToolDisplayName('msci-reports__search_reports');
    expect(result).toBe('Msci Reports: Search Reports');
  });

  it('formats simple tool name', () => {
    const result = formatToolDisplayName('web_search');
    expect(result).toBe('Web Search');
  });

  it('handles tool name with dashes', () => {
    const result = formatToolDisplayName('audience-manager');
    expect(result).toBe('Audience Manager');
  });

  it('handles double underscore separator', () => {
    const result = formatToolDisplayName('confluence__search_pages');
    expect(result).toBe('Confluence: Search Pages');
  });
});

describe('formatToolReference', () => {
  it('formats tool with query', () => {
    const source: ToolSource = {
      tool: 'msci-reports__search',
      displayName: 'MSCI Reports: Search',
      action: 'search',
      query: 'Hulu',
    };
    const result = formatToolReference(source, 1);
    expect(result).toBe('[1] MSCI Reports: Search - "Hulu"');
  });

  it('formats tool without query', () => {
    const source: ToolSource = {
      tool: 'some_tool',
      displayName: 'Some Tool',
      action: 'action',
    };
    const result = formatToolReference(source, 2);
    expect(result).toBe('[2] Some Tool');
  });

  it('truncates long query', () => {
    const source: ToolSource = {
      tool: 'search',
      displayName: 'Search',
      action: 'search',
      query: 'A'.repeat(60),
    };
    const result = formatToolReference(source, 1);
    expect(result).toBe('[1] Search - "' + 'A'.repeat(50) + '"');
  });

  it('formats tool with URL as clickable link', () => {
    const source: ToolSource = {
      tool: 'exa__search',
      displayName: 'Exa Search',
      action: 'search',
      url: 'https://example.com/result',
    };
    const result = formatToolReference(source, 1);
    expect(result).toBe('[1] <https://example.com/result|Exa Search>');
  });

  it('sanitizes special characters', () => {
    const source: ToolSource = {
      tool: 'tool',
      displayName: 'Tool|Name',
      action: 'action',
      query: 'query>with<special',
    };
    const result = formatToolReference(source, 1);
    expect(result).toBe('[1] Tool¦Name - "query›with‹special"');
  });
});

describe('formatDocumentReference', () => {
  it('formats citation with document name', () => {
    const citation: ParsedCitation = {
      type: 'cite',
      cited_text: 'Q3 revenue grew 12% YoY',
      document_index: 0,
      start_char_index: 45,
      end_char_index: 71,
      document_name: 'MSCI_Report.pdf',
    };
    const result = formatDocumentReference(citation, 1);
    expect(result).toBe('[1] "Q3 revenue grew 12% YoY" - MSCI_Report.pdf');
  });

  it('formats citation with page number', () => {
    const citation: ParsedCitation = {
      type: 'cite',
      cited_text: 'User retention improved 5%',
      document_index: 0,
      start_char_index: 0,
      end_char_index: 26,
      document_name: 'Analytics_Summary.pdf',
      page_number: 5,
    };
    const result = formatDocumentReference(citation, 2);
    expect(result).toBe('[2] "User retention improved 5%" - Analytics_Summary.pdf, page 5');
  });

  it('truncates long cited text', () => {
    const citation: ParsedCitation = {
      type: 'cite',
      cited_text: 'This is a very long citation that exceeds the maximum length limit',
      document_index: 0,
      start_char_index: 0,
      end_char_index: 66,
      document_name: 'Document.pdf',
    };
    const result = formatDocumentReference(citation, 1);
    // truncateCitedText uses 50 char default, so text is truncated at 47 + "..."
    expect(result).toBe('[1] "This is a very long citation that exceeds the m..." - Document.pdf');
  });

  it('sanitizes special characters in citation', () => {
    const citation: ParsedCitation = {
      type: 'cite',
      cited_text: 'Text with | and > special chars',
      document_index: 0,
      start_char_index: 0,
      end_char_index: 30,
      document_name: 'Report|Summary.pdf',
    };
    const result = formatDocumentReference(citation, 1);
    expect(result).toBe('[1] "Text with ¦ and › special chars" - Report¦Summary.pdf');
  });
});

describe('buildUnifiedReferences', () => {
  it('builds references with tools first, then documents', () => {
    const tools: ToolSource[] = [
      { tool: 'msci', displayName: 'MSCI Reports', action: 'search', query: 'Hulu' },
    ];
    const citations: ParsedCitation[] = [
      {
        type: 'cite',
        cited_text: 'Revenue grew',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 12,
        document_name: 'Report.pdf',
      },
    ];

    const result = buildUnifiedReferences(tools, citations);

    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe('tool');
    expect(result[0]?.index).toBe(1);
    expect(result[1]?.type).toBe('document');
    expect(result[1]?.index).toBe(2);
  });

  it('handles tools only', () => {
    const tools: ToolSource[] = [
      { tool: 'tool1', displayName: 'Tool 1', action: 'a' },
      { tool: 'tool2', displayName: 'Tool 2', action: 'b' },
    ];

    const result = buildUnifiedReferences(tools, []);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === 'tool')).toBe(true);
    expect(result[0]?.index).toBe(1);
    expect(result[1]?.index).toBe(2);
  });

  it('handles documents only', () => {
    const citations: ParsedCitation[] = [
      {
        type: 'cite',
        cited_text: 'A',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 1,
        document_name: 'Doc.pdf',
      },
    ];

    const result = buildUnifiedReferences([], citations);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('document');
    expect(result[0]?.index).toBe(1);
  });

  it('returns empty array for no references', () => {
    const result = buildUnifiedReferences([], []);
    expect(result).toEqual([]);
  });
});

describe('formatReferencesBlock', () => {
  it('creates unified references block with tools and documents', () => {
    const tools: ToolSource[] = [
      { tool: 'msci', displayName: 'MSCI Reports', action: 'Search', query: 'Hulu' },
    ];
    const citations: ParsedCitation[] = [
      {
        type: 'cite',
        cited_text: 'Q3 revenue grew 12%',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 19,
        document_name: 'Report.pdf',
      },
    ];

    const result = formatReferencesBlock(tools, citations);

    expect(result).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '*References:*\n[1] MSCI Reports - "Hulu"\n[2] "Q3 revenue grew 12%" - Report.pdf',
        },
      ],
    });
  });

  it('creates block with tools only', () => {
    const tools: ToolSource[] = [
      { tool: 'confluence', displayName: 'Confluence', action: 'Search', query: 'onboarding' },
    ];

    const result = formatReferencesBlock(tools, []);

    expect(result?.elements[0]?.text).toBe(
      '*References:*\n[1] Confluence - "onboarding"'
    );
  });

  it('creates block with documents only', () => {
    const citations: ParsedCitation[] = [
      {
        type: 'cite',
        cited_text: 'User retention improved',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 23,
        document_name: 'Analytics.pdf',
        page_number: 3,
      },
    ];

    const result = formatReferencesBlock([], citations);

    expect(result?.elements[0]?.text).toBe(
      '*References:*\n[1] "User retention improved" - Analytics.pdf, page 3'
    );
  });

  it('returns null for empty references', () => {
    const result = formatReferencesBlock([], []);
    expect(result).toBeNull();
  });

  it('shows tools with and without URLs (filtering is done by caller)', () => {
    // Note: formatReferencesBlock no longer filters - it trusts the caller
    // to pass pre-filtered sources via filterClickableSources
    const tools: ToolSource[] = [
      { tool: 'exa', displayName: 'Exa', action: 'search', url: 'https://example.com' },
      { tool: 'msci', displayName: 'MSCI', action: 'search', query: 'data' },
    ];

    const result = formatReferencesBlock(tools, []);

    // Both should be included since no filtering happens here
    expect(result?.elements[0]?.text).toBe(
      '*References:*\n[1] <https://example.com|Exa>\n[2] MSCI - "data"'
    );
  });

  it('formats tools with URLs as clickable links', () => {
    const tools: ToolSource[] = [
      { tool: 'exa1', displayName: 'Exa 1', action: 'a', url: 'https://a.com' },
      { tool: 'exa2', displayName: 'Exa 2', action: 'b', url: 'https://b.com' },
    ];

    const result = formatReferencesBlock(tools, []);

    // Both tools with URLs should be formatted as clickable links
    expect(result?.elements[0]?.text).toBe(
      '*References:*\n[1] <https://a.com|Exa 1>\n[2] <https://b.com|Exa 2>'
    );
  });

  it('handles multiple tools and documents', () => {
    const tools: ToolSource[] = [
      { tool: 't1', displayName: 'Tool 1', action: 'a', query: 'q1' },
      { tool: 't2', displayName: 'Tool 2', action: 'b', query: 'q2' },
    ];
    const citations: ParsedCitation[] = [
      {
        type: 'cite',
        cited_text: 'Citation 1',
        document_index: 0,
        start_char_index: 0,
        end_char_index: 10,
        document_name: 'Doc1.pdf',
      },
      {
        type: 'cite',
        cited_text: 'Citation 2',
        document_index: 1,
        start_char_index: 0,
        end_char_index: 10,
        document_name: 'Doc2.pdf',
      },
    ];

    const result = formatReferencesBlock(tools, citations);

    expect(result?.elements[0]?.text).toBe(
      '*References:*\n[1] Tool 1 - "q1"\n[2] Tool 2 - "q2"\n[3] "Citation 1" - Doc1.pdf\n[4] "Citation 2" - Doc2.pdf'
    );
  });
});

describe('contextSourceToToolSource', () => {
  it('converts context source to tool source', () => {
    const source = {
      type: 'tool',
      title: 'MSCI Reports',
      reference: 'msci-reports__search',
      toolContext: 'Hulu',
    };

    const result = contextSourceToToolSource(source);

    expect(result).toEqual({
      tool: 'msci-reports__search',
      displayName: 'MSCI Reports',
      action: 'tool',
      query: 'Hulu',
      url: undefined,
    });
  });

  it('uses title as tool when no reference', () => {
    const source = {
      type: 'tool',
      title: 'Some Tool',
    };

    const result = contextSourceToToolSource(source);

    expect(result.tool).toBe('Some Tool');
    expect(result.displayName).toBe('Some Tool');
  });

  it('includes URL when present', () => {
    const source = {
      type: 'tool',
      title: 'Exa Result',
      url: 'https://example.com',
    };

    const result = contextSourceToToolSource(source);

    expect(result.url).toBe('https://example.com');
  });
});
