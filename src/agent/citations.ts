/**
 * Citation Module (Story 2.7)
 *
 * Defines citation types and helpers for source attribution.
 * Citations track where Orion's information comes from.
 *
 * @see Story 2.7 - Source Citations
 * @see FR6 - System cites sources for factual claims
 */

/**
 * Source type for citations.
 * Extends gather.ts ContextSource types with additional source types.
 */
export type CitationType = 'thread' | 'file' | 'web' | 'confluence' | 'slack';

/**
 * Citation for a source used in a response.
 * Normalized format used across the system.
 */
export interface Citation {
  /** 1-indexed citation ID for inline references [1], [2], etc. */
  id: number;
  /** Source type for categorization */
  type: CitationType;
  /** Human-readable title */
  title: string;
  /** URL if available (for clickable links) */
  url?: string;
  /** Short excerpt from the source */
  excerpt?: string;
}

function sanitizeSlackLinkText(text: string): string {
  return text.replaceAll('|', '¦').replaceAll('>', '›').replaceAll('<', '‹');
}

function sanitizeSlackLinkUrl(url: string): string {
  return url
    .trim()
    .replaceAll('|', '%7C')
    .replaceAll('>', '%3E')
    .replaceAll('<', '%3C');
}

/**
 * Format a Slack mrkdwn link: <URL|text>
 * Sanitizes URL + text to avoid breaking Slack link syntax.
 */
export function formatSlackLink(params: { url: string; text: string }): string {
  return `<${sanitizeSlackLinkUrl(params.url)}|${sanitizeSlackLinkText(params.text)}>`;
}

/**
 * Format citation as a Slack link.
 * Uses Slack mrkdwn syntax: <URL|text>
 *
 * @param citation - Citation to format
 * @returns Formatted string with link if URL available
 */
export function formatCitationLink(citation: Citation): string {
  if (citation.url) {
    return formatSlackLink({ url: citation.url, text: citation.title });
  }
  return sanitizeSlackLinkText(citation.title);
}

/**
 * Format citations as a footer section.
 * Fallback plain text format for non-Block Kit contexts.
 *
 * @param citations - Array of citations to format
 * @returns Formatted footer string, empty if no citations
 *
 * @example
 * // Returns:
 * // _Sources:_
 * // • [1] <https://confluence.samba.tv/page|Company Overview>
 * // • [2] Thread message
 */
export function formatCitationFooter(citations: Citation[]): string {
  if (citations.length === 0) return '';

  return (
    '\n\n_Sources:_\n' +
    citations
      .map((c) => {
        const link = formatCitationLink(c);
        return `• [${c.id}] ${link}`;
      })
      .join('\n')
  );
}

/**
 * Result of uncited claims detection.
 */
export interface UncitedClaimsResult {
  /** Whether uncited factual claims were detected */
  hasUncitedClaims: boolean;
  /** Number of unique inline citation markers found */
  citationCount: number;
  /** Unique citation IDs found in text */
  citedIds: number[];
}

/**
 * Detect uncited claims in a response.
 *
 * Simple heuristic approach for v1:
 * 1. Check if sources were gathered during the gather phase
 * 2. Check if the response contains citation markers [1], [2], etc.
 * 3. If sources gathered but no citations rendered → likely uncited factual claims
 *
 * Full NLP-based claim detection is overkill for v1.
 *
 * @param response - The response text to check
 * @param sourcesGathered - Sources that were gathered for this response
 * @returns Detection result with citation counts
 */
export function detectUncitedClaims(
  response: string,
  sourcesGathered: Citation[]
): UncitedClaimsResult {
  // Count citation markers in response [1], [2], etc.
  const citationPattern = /\[(\d+)\]/g;
  const matches = [...response.matchAll(citationPattern)];

  // Extract unique citation IDs
  const citedIds = [...new Set(matches.map((m) => parseInt(m[1] ?? '0', 10)))].filter(
    (id) => id > 0
  );

  const citationCount = citedIds.length;

  // If we gathered sources but response has no citations, flag it
  const hasUncitedClaims = sourcesGathered.length > 0 && citationCount === 0;

  return { hasUncitedClaims, citationCount, citedIds };
}

/**
 * Pattern-based factual indicators.
 * These patterns suggest factual claims that should be cited.
 * Reserved for future enhancement beyond the simple heuristic.
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

