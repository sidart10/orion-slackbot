/**
 * Sources Block Kit Module (Story 2.7, Story 8.1)
 *
 * Creates Block Kit context blocks for source citations.
 * Updated for Story 8.1: Professional format without emojis.
 * Format: "*References:*\n[1] Tool Name: Action - "query""
 *
 * @see Story 2.7 - Source Citations
 * @see Story 8.1 - Citations & Sources Unification
 * @see AC#2 - Remove Emojis from Sources Display
 */

import { formatSlackLink } from '../agent/citations.js';

/**
 * Source citation for Block Kit rendering.
 * Simplified interface for the sources block.
 */
export interface SourceCitation {
  /** 1-indexed citation ID */
  id: number;
  /** Human-readable title */
  title: string;
  /** URL for clickable link (optional) */
  url?: string;
  /** Memory sources don't need URLs (implicit trust) */
  isMemory?: boolean;
  /** Tool sources show what was called (no URL needed) */
  isTool?: boolean;
  /** Brief context about tool usage (e.g., search query) */
  toolContext?: string;
}

/**
 * Block Kit context block structure for sources.
 * Uses mrkdwn for Slack formatting.
 */
interface SourcesContextBlock {
  type: 'context';
  elements: Array<{ type: 'mrkdwn'; text: string }>;
}

/**
 * Format a single source for display.
 *
 * Story 8.1: Professional format without emojis.
 * Tool sources: `Tool Name: Action - "query"`
 *
 * @param source - Source to format
 * @returns Formatted string with Slack link syntax if URL available
 *
 * @see AC#2 - Remove Emojis from Sources Display
 */
function formatSourceLink(source: SourceCitation): string {
  const sanitize = (s: string) => s.replaceAll('|', '¦').replaceAll('>', '›').replaceAll('<', '‹');

  if (source.url) {
    // Slack link format: <URL|display text>
    return formatSlackLink({ url: source.url, text: source.title });
  }

  // Tool sources: show tool name with context (no emoji)
  // Story 8.1 AC#2: Format as `Tool Name: Action - "query"`
  if (source.isTool) {
    const title = sanitize(source.title);
    if (source.toolContext) {
      const context = sanitize(source.toolContext.slice(0, 50));
      return `${title} - "${context}"`;
    }
    return title;
  }

  return sanitize(source.title);
}

/**
 * Create Block Kit context block for source citations.
 *
 * Story 8.1: Professional format with "*References:*" header (no emoji).
 * Format: "*References:*\n[1] Tool Name - "query"\n[2] <url|Title>"
 *
 * @param sources - Array of source citations to render
 * @returns Block Kit context block, or null if no sources
 *
 * @see AC#2 - Remove Emojis, use `*References:*` header
 *
 * @example
 * const block = createSourcesContextBlock([
 *   { id: 1, title: 'Company Overview', url: 'https://confluence.samba.tv/page' },
 *   { id: 2, title: 'MSCI Reports: Search', isTool: true, toolContext: 'Hulu' },
 * ]);
 * // Returns:
 * // {
 * //   type: 'context',
 * //   elements: [{
 * //     type: 'mrkdwn',
 * //     text: '*References:*\n[1] <https://...|Company Overview>\n[2] MSCI Reports: Search - "Hulu"'
 * //   }]
 * // }
 */
export function createSourcesContextBlock(
  sources: SourceCitation[]
): SourcesContextBlock | null {
  // Filter to displayable sources:
  // - Memory sources: always show (implicit trust)
  // - Tool sources: only show if they DON'T have URLs
  //   (Claude cites URLs inline; footer is for "what tool was called" transparency)
  // - Thread/file/other: only show if they have clickable URLs
  const displayable = sources.filter((s) => {
    if (s.isMemory) return true;
    if (s.isTool) return !s.url;
    return !!s.url;
  });

  if (displayable.length === 0) return null;

  const sourceLines = displayable
    .map((s, idx) => {
      const link = formatSourceLink(s);
      // Re-number sources based on filtered list
      return `[${idx + 1}] ${link}`;
    })
    .join('\n');

  // Story 8.1 AC#2: Use *References:* header (Slack mrkdwn bold, no emoji)
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*References:*\n${sourceLines}`,
      },
    ],
  };
}

