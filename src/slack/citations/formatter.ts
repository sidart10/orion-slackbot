/**
 * Unified References Formatter Module (Story 8.1)
 *
 * Creates Block Kit context blocks for unified references footer.
 * Combines tool sources and document citations into single `*References:*` block.
 *
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#3 - Unified References Footer Block
 * @see AC#4 - Citations-Only Mode for Documents
 */

import type { ParsedCitation, ToolSource, UnifiedReference } from './types.js';
import { truncateCitedText } from './parser.js';
import { formatSlackLink } from '../../agent/citations.js';

/**
 * Block Kit context block structure for unified references.
 * Uses mrkdwn for Slack formatting.
 */
export interface ReferencesContextBlock {
  type: 'context';
  elements: Array<{ type: 'mrkdwn'; text: string }>;
}

/**
 * Format tool display name for references.
 *
 * Converts tool names from MCP format to human-readable format.
 * Example: "msci-reports__search_reports" -> "MSCI Reports: Search Reports"
 *
 * @param tool - Tool identifier
 * @returns Human-readable display name
 */
export function formatToolDisplayName(tool: string): string {
  // MCP tools have format: serverName__toolName
  if (tool.includes('__')) {
    const [server, toolName] = tool.split('__', 2);
    const formatPart = (s: string): string =>
      s
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${formatPart(server ?? '')}: ${formatPart(toolName ?? '')}`;
  }
  // Static tools: just format nicely
  return tool
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sanitize text for Slack mrkdwn.
 *
 * Escapes characters that could break Slack formatting.
 */
function sanitize(s: string): string {
  return s.replaceAll('|', '¦').replaceAll('>', '›').replaceAll('<', '‹');
}

/**
 * Format a tool source for the references block.
 *
 * Format: `[n] Tool Name: Action - "query"` (no emoji)
 *
 * @param source - Tool source to format
 * @param index - 1-indexed reference number
 * @returns Formatted reference string
 *
 * @see AC#2 - Format: `[n] Tool Name: Action - "query"`
 */
export function formatToolReference(source: ToolSource, index: number): string {
  const displayName = source.displayName || formatToolDisplayName(source.tool);

  if (source.url) {
    // Tool with URL: make it clickable
    return `[${index}] ${formatSlackLink({ url: source.url, text: displayName })}`;
  }

  // Tool without URL: show name and context
  if (source.query) {
    const context = sanitize(source.query.slice(0, 50));
    return `[${index}] ${sanitize(displayName)} - "${context}"`;
  }

  return `[${index}] ${sanitize(displayName)}`;
}

/**
 * Format a document citation for the references block.
 *
 * Format: `[n] "cited excerpt..." - Document.pdf, page X` (if page available)
 *
 * @param citation - Parsed citation to format
 * @param index - 1-indexed reference number
 * @returns Formatted reference string
 *
 * @see AC#3 - Document citations format
 */
export function formatDocumentReference(citation: ParsedCitation, index: number): string {
  const excerpt = truncateCitedText(citation.cited_text, 50);

  let reference = `[${index}] "${sanitize(excerpt)}" - ${sanitize(citation.document_name)}`;

  if (citation.page_number !== undefined) {
    reference += `, page ${citation.page_number}`;
  }

  return reference;
}

/**
 * Create unified references list from tool sources and document citations.
 *
 * Tools are listed first, then document citations.
 * All entries share a single numbered sequence.
 *
 * @param toolSources - Array of tool sources
 * @param documentCitations - Array of parsed document citations
 * @returns Array of unified references with index and display text
 *
 * @see AC#4 - Merge into unified numbered list (tools first, then documents)
 */
export function buildUnifiedReferences(
  toolSources: ToolSource[],
  documentCitations: ParsedCitation[]
): UnifiedReference[] {
  const references: UnifiedReference[] = [];
  let index = 1;

  // Tool sources first
  for (const source of toolSources) {
    references.push({
      index,
      type: 'tool',
      displayText: formatToolReference(source, index),
      url: source.url,
    });
    index++;
  }

  // Document citations second
  for (const citation of documentCitations) {
    references.push({
      index,
      type: 'document',
      displayText: formatDocumentReference(citation, index),
    });
    index++;
  }

  return references;
}

/**
 * Create Block Kit context block for unified references.
 *
 * Combines tool sources AND document citations into a single `*References:*` block.
 * Returns null if no references exist.
 *
 * @param toolSources - Array of tool sources (MCP tools called)
 * @param documentCitations - Array of parsed document citations
 * @returns Block Kit context block, or null if no references
 *
 * @see AC#3 - Single Block Kit context block at end of responses
 * @see AC#4 - If both exist, merge into unified numbered list
 * @see AC#6 - If no document citations but tool sources exist, show tool sources only
 *
 * @example
 * const block = formatReferencesBlock(
 *   [{ tool: 'msci-reports__search', displayName: 'MSCI Reports', action: 'Search', query: 'Hulu' }],
 *   [{ type: 'cite', cited_text: 'Q3 revenue grew 12%', document_name: 'Report.pdf', ... }]
 * );
 * // Returns:
 * // {
 * //   type: 'context',
 * //   elements: [{
 * //     type: 'mrkdwn',
 * //     text: '*References:*\n[1] MSCI Reports - "Hulu"\n[2] "Q3 revenue grew 12%" - Report.pdf'
 * //   }]
 * // }
 */
export function formatReferencesBlock(
  toolSources: ToolSource[],
  documentCitations: ParsedCitation[]
): ReferencesContextBlock | null {
  // Note: No filtering here - callers should pass pre-filtered sources
  // from filterClickableSources which handles type-specific URL logic:
  // - Tool sources: only those WITHOUT URLs (Claude cites URLs inline)
  // - File/thread sources: only those WITH URLs (need clickable links)
  // - Memory sources: always shown (implicit trust)
  const references = buildUnifiedReferences(toolSources, documentCitations);

  if (references.length === 0) {
    return null;
  }

  const lines = references.map((ref) => ref.displayText).join('\n');

  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*References:*\n${lines}`,
      },
    ],
  };
}

/**
 * Convert ContextSource to ToolSource for formatting.
 *
 * Bridges the agent's ContextSource type to the formatter's ToolSource type.
 *
 * @param source - Agent context source
 * @returns Tool source for formatting
 */
export function contextSourceToToolSource(source: {
  type: string;
  title: string;
  reference?: string;
  url?: string;
  toolContext?: string;
}): ToolSource {
  return {
    tool: source.reference ?? source.title,
    displayName: source.title,
    action: source.type,
    query: source.toolContext,
    url: source.url,
  };
}
