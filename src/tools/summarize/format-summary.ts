/**
 * Summary Response Formatting
 *
 * Formats summary results for Slack using mrkdwn.
 * Uses Research Response pattern from UX spec.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#6 - Format Response per UX Spec
 * @see project-context.md Slack mrkdwn Reference
 */

import type { SummaryResult } from './summarize-types.js';

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

  let header = `🔍 Summarized *${result.messageCount}* messages`;

  if (result.timeRange) {
    header += ` from ${emoji}${typeLabel} (${result.timeRange.description})`;
  }

  if (result.truncated) {
    header +=
      '\n⚠️ _Showing summary of first 500 messages — conversation had more._';
  }

  let response = `${header}\n\n${result.summary}`;

  // Add source link if available
  if (result.sourceUrl) {
    const linkLabel = result.type === 'thread' ? 'View thread' : 'View conversation';
    response += `\n\n📎 <${result.sourceUrl}|${linkLabel}>`;
  }

  // Add drill-down prompt
  response += '\n\n_Need more detail on a specific topic? Just ask!_';

  return response;
}

