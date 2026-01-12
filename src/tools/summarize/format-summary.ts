/**
 * Summary Response Formatting
 *
 * Formats summary results for Slack using mrkdwn.
 * Uses Research Response pattern from UX spec.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see Story 7.8 - Enhanced Slack UI Polish (AC5 - uses formatting constants)
 * @see AC#6 - Format Response per UX Spec
 * @see project-context.md Slack mrkdwn Reference
 */

import type { SummaryResult } from './summarize-types.js';
import { STATUS_EMOJI } from '../../slack/formatting-constants.js';

/**
 * Conversation type indicators.
 * Note: These are functional type indicators (not status emojis),
 * so they are kept here rather than in formatting-constants.ts.
 * STATUS_EMOJI is for status messages (searching, success, warning, etc.)
 */
const TYPE_EMOJI: Record<string, string> = {
  public_channel: '#',
  private_channel: '🔒',
  channel: '#',
  mpim: '👥',
  im: '💬',
  thread: '🧵',
};

/**
 * Format summary for Slack using mrkdwn.
 * Uses Research Response pattern from UX spec.
 *
 * @param result - Summary result to format
 * @returns Formatted string for Slack
 *
 * @see Story 7.6 - AC#6 Format Response per UX Spec
 */
export function formatSummaryResponse(result: SummaryResult): string {
  const emoji = TYPE_EMOJI[result.type] || '💬';
  const typeLabel = result.type === 'thread' ? 'thread' : 'conversation';

  // Use STATUS_EMOJI.searching for header indicator (per Story 7.8 AC5)
  // Empty string by design for professional appearance
  const searchIndicator = STATUS_EMOJI.searching;
  let header = `${searchIndicator}Summarized *${result.messageCount}* messages`.trim();

  if (result.timeRange) {
    header += ` from ${emoji}${typeLabel} (${result.timeRange.description})`;
  }

  if (result.truncated) {
    // Use STATUS_EMOJI.warning for truncation notice (per Story 7.8 AC5)
    // Empty string by design - functional text conveys warning without emoji
    const warningIndicator = STATUS_EMOJI.warning;
    header += `\n${warningIndicator}_Showing summary of first 500 messages — conversation had more._`.trim();
  }

  let response = `${header}\n\n${result.summary}`;

  // Add source link if available
  if (result.sourceUrl) {
    const linkLabel = result.type === 'thread' ? 'View thread' : 'View conversation';
    response += `\n\n<${result.sourceUrl}|${linkLabel}>`;
  }

  // Add drill-down prompt (uses STATUS_EMOJI.tip - empty by design)
  const tipIndicator = STATUS_EMOJI.tip;
  response += `\n\n${tipIndicator}_Need more detail on a specific topic? Just ask!_`.trim();

  return response;
}

