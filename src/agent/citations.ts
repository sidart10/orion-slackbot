/**
 * Citation Module
 *
 * Provides source citation formatting and detection for Orion responses.
 * Supports inline citations [1] and footer citations with Slack link formatting.
 *
 * @see Story 2.7 - Source Citations
 * @see AC#1 - Sources are cited inline or at the end of the response
 * @see AC#2 - Citations include links when available
 * @see AC#4 - Uncited factual claims are flagged during verification
 * @see FR6 - System cites sources for factual claims
 */

/**
 * A source citation with metadata
 */
export interface Citation {
  /** Unique citation ID (1-indexed for display) */
  id: number;
  /** Type of source */
  type: 'thread' | 'file' | 'web' | 'confluence' | 'slack';
  /** Display title for the citation */
  title: string;
  /** URL to the source (optional) */
  url?: string;
  /** Excerpt from the source (optional) */
  excerpt?: string;
}

/**
 * Format an inline citation marker
 *
 * @param citation - The citation to format
 * @returns Inline citation marker like "[1]"
 *
 * @example
 * formatInlineCitation({ id: 1, type: 'web', title: 'Test' })
 * // Returns: "[1]"
 */
export function formatInlineCitation(citation: Citation): string {
  return `[${citation.id}]`;
}

/**
 * Escape special characters for Slack link syntax
 *
 * Slack links use <URL|text> format, so we must escape:
 * - `<` → `&lt;`
 * - `>` → `&gt;`
 * - `|` → URL-encoded in URLs, removed from text
 *
 * @param text - Text to escape
 * @param isUrl - Whether this is a URL (different escaping rules)
 * @returns Escaped text safe for Slack links
 */
function escapeSlackLinkChars(text: string, isUrl: boolean): string {
  if (isUrl) {
    // For URLs: encode pipe character, leave < > as-is (rare in URLs)
    return text.replace(/\|/g, '%7C');
  }
  // For display text: escape < > and remove pipe (would break syntax)
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '-');
}

/**
 * Format a URL with display text in Slack's link syntax
 *
 * @param url - The URL to link to
 * @param displayText - The text to display for the link
 * @returns Slack-formatted link like "<https://url|Text>"
 *
 * @example
 * formatSlackLink('https://example.com', 'Example')
 * // Returns: "<https://example.com|Example>"
 */
export function formatSlackLink(url: string, displayText: string): string {
  const safeUrl = escapeSlackLinkChars(url, true);
  const safeText = escapeSlackLinkChars(displayText, false);
  return `<${safeUrl}|${safeText}>`;
}

/**
 * Format a citation footer for Slack display
 *
 * Creates a footer section with all citations formatted as a bulleted list.
 * URLs are formatted as Slack links when available.
 *
 * @param citations - Array of citations to format
 * @returns Formatted footer string, or empty string if no citations
 *
 * @example
 * formatCitationFooter([
 *   { id: 1, type: 'confluence', title: 'Overview', url: 'https://conf.example.com' }
 * ])
 * // Returns: "\n\n_Sources:_\n• [1] <https://conf.example.com|Overview>"
 */
export function formatCitationFooter(citations: Citation[]): string {
  if (citations.length === 0) return '';

  const lines = citations.map((c) => {
    const link = c.url ? formatSlackLink(c.url, c.title) : c.title;
    return `• [${c.id}] ${link}`;
  });

  return '\n\n_Sources:_\n' + lines.join('\n');
}

/**
 * Result of uncited claim detection
 */
export interface UncitedClaimResult {
  /** Whether there are likely uncited factual claims */
  hasUncitedClaims: boolean;
  /** Number of unique citations found in the response */
  citationCount: number;
}

/**
 * Detect uncited factual claims in a response
 *
 * Simple heuristic approach for v1:
 * 1. Check if sources were gathered during the gather phase
 * 2. Check if the response contains ANY citation markers [1], [2], etc.
 * 3. If sources gathered but no citations → likely uncited factual claims
 *
 * Full NLP-based claim detection is overkill for v1.
 *
 * @param response - The response text to analyze
 * @param sourcesGathered - Citations from sources gathered during gather phase
 * @returns Detection result with hasUncitedClaims flag and citation count
 *
 * @example
 * detectUncitedClaims('Samba provides data [1]', [{ id: 1, ... }])
 * // Returns: { hasUncitedClaims: false, citationCount: 1 }
 */
export function detectUncitedClaims(
  response: string,
  sourcesGathered: Citation[]
): UncitedClaimResult {
  // Count citation markers in response
  const citationPattern = /\[\d+\]/g;
  const citationMatches = response.match(citationPattern) || [];
  const citationCount = new Set(citationMatches).size; // Unique citations

  // If we gathered sources but response has no citations, flag it
  const hasUncitedClaims = sourcesGathered.length > 0 && citationCount === 0;

  return { hasUncitedClaims, citationCount };
}

/**
 * Patterns that indicate factual claims which should be cited
 *
 * These patterns suggest the response contains factual information
 * that would benefit from source citations. Used by detectFactualClaims().
 */
export const FACTUAL_INDICATORS: RegExp[] = [
  /\d{4}/, // Years (e.g., "In 2023...")
  /\d+%/, // Percentages
  /\$[\d,]+/, // Dollar amounts
  /according to/i, // Attribution phrases
  /studies show/i,
  /research indicates/i,
  /officially/i,
];

/**
 * Detect if a response contains factual claims that should be cited
 *
 * Uses pattern matching to identify statements that typically require
 * source attribution (dates, statistics, attributions).
 *
 * @param response - The response text to analyze
 * @returns true if factual claims are detected
 */
export function detectFactualClaims(response: string): boolean {
  return FACTUAL_INDICATORS.some((pattern) => pattern.test(response));
}

/**
 * Source interface from loop.ts (re-exported for convenience)
 */
import type { Source } from './loop.js';

/**
 * Citation registry containing citations and lookup map
 */
export interface CitationRegistry {
  /** Array of citations with sequential IDs */
  citations: Citation[];
  /** Map from source reference to citation for quick lookup */
  citationMap: Map<string, Citation>;
}

/**
 * Extract URL from a source reference if present
 *
 * Looks for URLs in the reference string, handling various formats:
 * - Direct URL: "https://example.com"
 * - Tool output: "confluence: Page Title (https://confluence.example.com/page)"
 * - Slack format: "slack: #channel (https://slack.com/archives/...)"
 *
 * @param reference - The source reference string
 * @returns Extracted URL or undefined
 */
function extractUrlFromReference(reference: string): string | undefined {
  // Check if the entire reference is a URL
  if (reference.startsWith('http://') || reference.startsWith('https://')) {
    return reference;
  }

  // Look for URL in parentheses: "Title (https://...)"
  const parenMatch = reference.match(/\(https?:\/\/[^)]+\)/);
  if (parenMatch) {
    return parenMatch[0].slice(1, -1); // Remove parentheses
  }

  // Look for URL after colon: "tool: https://..."
  const colonMatch = reference.match(/:\s*(https?:\/\/\S+)/);
  if (colonMatch) {
    return colonMatch[1];
  }

  return undefined;
}

/**
 * Convert a Source from the gather phase to a Citation
 *
 * Handles different source types and extracts URLs when applicable.
 * For tool sources, infers the actual citation type from the reference.
 *
 * @param source - Source from GatheredContext
 * @param id - Citation ID (1-indexed)
 * @returns Citation with appropriate type and URL
 *
 * @example
 * sourceToCitation({ type: 'web', reference: 'https://example.com' }, 1)
 * // Returns: { id: 1, type: 'web', title: 'https://example.com', url: 'https://example.com' }
 */
export function sourceToCitation(source: Source, id: number): Citation {
  let type: Citation['type'] = source.type === 'tool' ? 'web' : source.type;
  let title = source.reference;

  // Handle tool sources - infer actual type from reference
  if (source.type === 'tool') {
    if (source.reference.toLowerCase().includes('confluence')) {
      type = 'confluence';
      // Extract the title after the colon, before any URL
      const colonIndex = source.reference.indexOf(':');
      if (colonIndex !== -1) {
        const titlePart = source.reference
          .slice(colonIndex + 1)
          .trim()
          .replace(/\s*\(https?:\/\/[^)]+\)/, '')
          .trim();
        title = titlePart || source.reference;
      }
    } else if (source.reference.toLowerCase().includes('slack')) {
      type = 'slack';
      const colonIndex = source.reference.indexOf(':');
      if (colonIndex !== -1) {
        const titlePart = source.reference
          .slice(colonIndex + 1)
          .trim()
          .replace(/\s*\(https?:\/\/[^)]+\)/, '')
          .trim();
        title = titlePart || source.reference;
      }
    }
  }

  // Extract URL from reference - works for all source types
  const url = extractUrlFromReference(source.reference);

  return {
    id,
    type,
    title,
    url,
    excerpt: source.excerpt,
  };
}

/**
 * Build a citation registry from gathered sources
 *
 * Creates sequential citation IDs and provides a lookup map for
 * quick reference-to-citation resolution. Deduplicates sources
 * with the same reference.
 *
 * @param sources - Sources from GatheredContext.relevantSources
 * @returns CitationRegistry with citations array and lookup map
 *
 * @example
 * const registry = buildCitationRegistry(gatheredContext.relevantSources);
 * const footer = formatCitationFooter(registry.citations);
 */
export function buildCitationRegistry(sources: Source[]): CitationRegistry {
  const citationMap = new Map<string, Citation>();
  const citations: Citation[] = [];
  let nextId = 1;

  for (const source of sources) {
    // Skip duplicates
    if (citationMap.has(source.reference)) {
      continue;
    }

    const citation = sourceToCitation(source, nextId);
    citations.push(citation);
    citationMap.set(source.reference, citation);
    nextId++;
  }

  return { citations, citationMap };
}

