/**
 * Citation Parser Module (Story 8.1)
 *
 * Extracts document citations from Anthropic API responses.
 * Handles responses with and without citations gracefully.
 *
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#1 - Anthropic Citations API Integration
 * @see AC#6 - Backwards Compatibility
 */

import type {
  DocumentCitation,
  ParsedCitation,
  DocumentMetadata,
} from './types.js';

/**
 * Content block from Anthropic API response.
 *
 * Can be text, tool_use, tool_result, or cite blocks.
 * We filter for 'cite' type blocks to extract citations.
 */
export interface ContentBlock {
  type: string;
  cited_text?: string;
  document_index?: number;
  start_char_index?: number;
  end_char_index?: number;
  [key: string]: unknown;
}

/**
 * Type guard to check if a content block is a citation block.
 *
 * @param block - Content block from Anthropic response
 * @returns True if the block is a cite block with all required fields
 */
export function isCiteBlock(block: ContentBlock): boolean {
  return (
    block.type === 'cite' &&
    typeof block.cited_text === 'string' &&
    typeof block.document_index === 'number' &&
    typeof block.start_char_index === 'number' &&
    typeof block.end_char_index === 'number'
  );
}

/**
 * Extract document citations from Anthropic API response content.
 *
 * Filters content blocks for 'cite' type and extracts citation data.
 * Returns empty array if no citations found (backwards compatible).
 *
 * @param content - Content array from Anthropic response
 * @returns Array of DocumentCitation objects
 *
 * @see AC#1 - Parse citation blocks from Claude's response
 * @see AC#6 - Handle responses without citations gracefully
 *
 * @example
 * ```typescript
 * const response = await anthropic.messages.create({ ... });
 * const citations = extractCitations(response.content);
 * // citations: DocumentCitation[] (may be empty)
 * ```
 */
export function extractCitations(content: ContentBlock[]): DocumentCitation[] {
  if (!content || !Array.isArray(content)) {
    return [];
  }

  return content
    .filter(isCiteBlock)
    .map((block) => ({
      type: 'cite' as const,
      cited_text: block.cited_text as string,
      document_index: block.document_index as number,
      start_char_index: block.start_char_index as number,
      end_char_index: block.end_char_index as number,
    }));
}

/**
 * Parse citations with document metadata for display.
 *
 * Enriches raw citations with human-readable document names and
 * optional page numbers from document metadata.
 *
 * @param citations - Raw citations from extractCitations()
 * @param documentMetadata - Metadata for documents sent to Claude
 * @returns Array of ParsedCitation with display-friendly fields
 *
 * @example
 * ```typescript
 * const metadata: DocumentMetadata[] = [
 *   { index: 0, name: 'MSCI_Report.pdf', page: 5 },
 *   { index: 1, name: 'Analytics.pdf' },
 * ];
 * const parsed = parseCitationsWithMetadata(citations, metadata);
 * // parsed[0].document_name === 'MSCI_Report.pdf'
 * // parsed[0].page_number === 5
 * ```
 */
export function parseCitationsWithMetadata(
  citations: DocumentCitation[],
  documentMetadata: DocumentMetadata[]
): ParsedCitation[] {
  return citations.map((citation) => {
    const metadata = documentMetadata.find(
      (doc) => doc.index === citation.document_index
    );

    return {
      ...citation,
      document_name: metadata?.name ?? `Document ${citation.document_index + 1}`,
      page_number: metadata?.page,
    };
  });
}

/**
 * Truncate cited text for display with ellipsis.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateCitedText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Deduplicate citations by cited_text.
 *
 * Multiple inline markers may reference the same cited text.
 * Deduplicate for cleaner display in References footer.
 *
 * @param citations - Array of citations (may have duplicates)
 * @returns Deduplicated citations array
 */
export function deduplicateCitations(
  citations: DocumentCitation[]
): DocumentCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.document_index}:${citation.start_char_index}:${citation.end_char_index}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Count citations by document index.
 *
 * Useful for observability and understanding which documents
 * contributed most to the response.
 *
 * @param citations - Array of citations
 * @returns Map of document_index to citation count
 */
export function countCitationsByDocument(
  citations: DocumentCitation[]
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const citation of citations) {
    const current = counts.get(citation.document_index) ?? 0;
    counts.set(citation.document_index, current + 1);
  }
  return counts;
}
