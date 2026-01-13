/**
 * Citation Types Module (Story 8.1)
 *
 * Defines types for Anthropic Citations API integration and unified references.
 *
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#1 - Anthropic Citations API Integration
 * @see AC#3 - Unified References Footer Block
 */

/**
 * Document citation from Anthropic Citations API.
 *
 * Claude returns citation blocks when citations are enabled on document content blocks.
 * These provide verifiable claim-to-source mapping with exact character positions.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/citations
 */
export interface DocumentCitation {
  /** Block type identifier from Anthropic response */
  type: 'cite';
  /** The exact text being cited from the document */
  cited_text: string;
  /** Which document (0-indexed) this citation references */
  document_index: number;
  /** Start character position in the source document */
  start_char_index: number;
  /** End character position in the source document */
  end_char_index: number;
}

/**
 * Parsed citation with additional metadata for display.
 *
 * Extends DocumentCitation with display-friendly fields like document name
 * and page number (when available from document metadata).
 */
export interface ParsedCitation extends DocumentCitation {
  /** Human-readable document name (extracted from metadata or placeholder) */
  document_name: string;
  /** Page number if available from document metadata */
  page_number?: number;
}

/**
 * Document metadata for citation display.
 *
 * When sending documents to Claude, track metadata here for citation display.
 */
export interface DocumentMetadata {
  /** Index matching document_index in citations (0-based) */
  index: number;
  /** Human-readable document name */
  name: string;
  /** Page number if applicable (for PDFs) */
  page?: number;
  /** Source type for categorization */
  source_type?: 'pdf' | 'text' | 'file' | 'upload';
}

/**
 * Tool source for References display.
 *
 * Represents an MCP tool call that contributed to the response.
 * Format: `[n] Tool Name: Action - "query"`
 */
export interface ToolSource {
  /** Tool identifier (e.g., 'msci-reports__search_reports') */
  tool: string;
  /** Human-readable tool display name */
  displayName: string;
  /** Action or method called */
  action: string;
  /** Query or context for the tool call (e.g., search query) */
  query?: string;
  /** URL if available (for direct links) */
  url?: string;
}

/**
 * Unified reference item for the References footer block.
 *
 * Combines both tool sources and document citations into a single format
 * for display in the unified `*References:*` footer.
 */
export interface UnifiedReference {
  /** Reference number (1-indexed) for inline markers [1], [2] */
  index: number;
  /** Reference type for formatting */
  type: 'tool' | 'document';
  /** Formatted display text for the reference */
  displayText: string;
  /** URL for clickable link (optional) */
  url?: string;
}

/**
 * Citation response event data for Langfuse observability.
 *
 * @see AC#5 - Langfuse Observability
 */
export interface CitationEventMetadata {
  /** Number of tool sources in the response */
  tool_source_count: number;
  /** Number of document citations in the response */
  document_citation_count: number;
  /** Types of citations used in this response */
  citation_types: Array<'tool' | 'document'>;
}
