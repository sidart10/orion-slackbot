/**
 * Slack Type Definitions
 *
 * Type definitions for Slack message handling.
 *
 * @see AC#1 - Message handling types
 */

import type {
  SlackEventMiddlewareArgs,
  AllMiddlewareArgs,
} from '@slack/bolt';

export type MessageEventArgs = SlackEventMiddlewareArgs<'message'> &
  AllMiddlewareArgs;

export interface SlackContext {
  userId: string;
  channelId: string;
  threadTs: string;
  teamId: string;
  messageText: string;
}

/**
 * Extracts a normalized context from a message event.
 * Returns null if the message should be ignored (bot messages, no text).
 *
 * @param args - Slack message event arguments
 * @returns SlackContext or null if message should be skipped
 */
export function extractContext(args: MessageEventArgs): SlackContext | null {
  const { message, context } = args;

  // Skip bot messages to avoid loops
  if ('bot_id' in message) return null;

  // Skip messages without text
  if (!('text' in message) || !message.text) return null;

  return {
    userId: 'user' in message ? message.user! : '',
    channelId: message.channel,
    threadTs: 'thread_ts' in message ? message.thread_ts! : message.ts,
    teamId: context.teamId || '',
    messageText: message.text,
  };
}

