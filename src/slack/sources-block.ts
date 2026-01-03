/**
 * Sources Block Kit Module (Story 2.7)
 *
 * Creates Block Kit context blocks for source citations.
 * Follows the UX spec pattern: "📎 Sources: [1] Name | [2] Name | [3] Name"
 *
 * @see Story 2.7 - Source Citations
 * @see UX Design Specification - Source Citations section
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
 * @param source - Source to format
 * @returns Formatted string with Slack link syntax if URL available
 */
function formatSourceLink(source: SourceCitation): string {
  const sanitize = (s: string) => s.replaceAll('|', '¦').replaceAll('>', '›').replaceAll('<', '‹');
  
  if (source.url) {
    // Slack link format: <URL|display text>
    return formatSlackLink({ url: source.url, text: source.title });
  }
  
  // Tool sources: show tool name with context
  if (source.isTool) {
    const title = sanitize(source.title);
    if (source.toolContext) {
      const context = sanitize(source.toolContext.slice(0, 50));
      return `🔧 ${title} — _${context}_`;
    }
    return `🔧 ${title}`;
  }
  
  return sanitize(source.title);
}

/**
 * Create Block Kit context block for source citations.
 *
 * Per UX spec: "📎 Sources: [1] Name | [2] Name | [3] Name"
 *
 * @param sources - Array of source citations to render
 * @returns Block Kit context block, or null if no sources
 *
 * @example
 * const block = createSourcesContextBlock([
 *   { id: 1, title: 'Company Overview', url: 'https://confluence.samba.tv/page' },
 *   { id: 2, title: 'Thread message' },
 * ]);
 * // Returns:
 * // {
 * //   type: 'context',
 * //   elements: [{
 * //     type: 'mrkdwn',
 * //     text: '📎 *Sources:* [1] <https://...|Company Overview> | [2] Thread message'
 * //   }]
 * // }
 */
export function createSourcesContextBlock(
  sources: SourceCitation[]
): SourcesContextBlock | null {
  // Filter to displayable sources:
  // - Sources with URLs (clickable)
  // - Memory sources (implicit trust)
  // - Tool sources (show what was used to generate response)
  const displayable = sources.filter((s) => s.url || s.isMemory || s.isTool);

  if (displayable.length === 0) return null;

  const sourceLines = displayable
    .map((s, idx) => {
      const link = formatSourceLink(s);
      // Re-number sources based on filtered list
      return `[${idx + 1}] ${link}`;
    })
    .join('\n');

  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📎 *Sources:*\n${sourceLines}`,
      },
    ],
  };
}

