/**
 * Conversation Target Parsing for Summarization
 *
 * Parses user messages to identify the target conversation.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#2 - Identify Conversation Target
 */

export interface ConversationTarget {
  /** Slack channel ID. Empty string if requires resolution (e.g., DM lookup). */
  channelId: string;
  /** Human-readable name (channel name or user name). */
  channelName?: string;
  /** Type of conversation. */
  type: 'public_channel' | 'private_channel' | 'mpim' | 'im' | 'current';
}

/**
 * Parse conversation target from user message.
 *
 * Supports:
 * - Channel mentions: `<#C123|channel-name>`
 * - "this channel", "this chat", "this group", "here" → current conversation
 * - "my DM with [name]" → IM type (requires user lookup, not implemented in MVP)
 *
 * Defaults to current conversation if no target specified.
 *
 * @param message - User message to parse
 * @param currentChannelId - The channel where the message was sent
 * @returns ConversationTarget with channelId and type
 */
export function parseConversationTarget(
  message: string,
  currentChannelId: string
): ConversationTarget {
  // Pattern: <#C123|channel-name> (Slack's formatted channel mention)
  const channelMention = message.match(/<#([A-Z0-9]+)\|([^>]+)>/);
  if (channelMention) {
    return {
      channelId: channelMention[1],
      channelName: channelMention[2],
      type: 'public_channel',
    };
  }

  // Pattern: "this channel", "this chat", "this group", "this conversation", "here"
  if (/this\s+(channel|chat|group|conversation)|here/i.test(message)) {
    return {
      channelId: currentChannelId,
      type: 'current',
    };
  }

  // Pattern: "my DM with [name]" or "DM with [name]" - requires user lookup (not MVP)
  const dmMatch = message.match(/(?:my\s+)?dm\s+with\s+([a-z\s]+)/i);
  if (dmMatch) {
    return {
      channelId: '', // Empty - requires resolution via users.list API
      channelName: dmMatch[1].trim(),
      type: 'im',
    };
  }

  // Default: use current conversation
  return {
    channelId: currentChannelId,
    type: 'current',
  };
}

