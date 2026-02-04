/**
 * Direct Message Handler
 *
 * Handles DM messages sent directly to the Orion bot.
 * Uses the shared message handler core for consistent behavior.
 *
 * @see PLAN-dm-group-dm-support.md - Task 2: Create DM Handler
 */

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { logger } from '../../utils/logger.js';
import { isDuplicateEvent } from '../event-dedup.js';
import { handleMessage, type MessageContext } from './message-core.js';
import type { SlackFile } from '../files/types.js';

/**
 * Message event with channel_type for filtering
 */
interface MessageEvent {
  type: string;
  channel: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  files?: SlackFile[];
}

/**
 * Handles direct messages sent to the Orion bot.
 *
 * This handler:
 * - Filters for 'im' channel type only
 * - Skips bot messages to prevent loops
 * - Skips message subtypes (edits, deletions)
 * - Uses event deduplication
 * - Delegates to shared message handler core
 *
 * @see PLAN-dm-group-dm-support.md
 */
export async function handleDirectMessage({
  message,
  event,
  client,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>): Promise<void> {
  // Use message or event - Bolt provides both
  const msg = (message ?? event) as MessageEvent;

  // DEBUG: Log all incoming messages to this handler
  logger.info({
    event: 'dm_handler_called',
    channel_type: msg.channel_type,
    channel: msg.channel,
    text: msg.text?.slice(0, 50),
    bot_id: msg.bot_id,
    subtype: msg.subtype,
  });

  // Filter for DM channel type only
  if (msg.channel_type !== 'im') {
    return;
  }

  const channelId = msg.channel;
  const messageTs = msg.ts;
  const userId = msg.user ?? '';
  const text = msg.text ?? '';

  // Skip bot messages to prevent loops
  if (msg.bot_id) {
    logger.debug({
      event: 'dm_skipped',
      reason: 'bot_message',
      channelId,
      messageTs,
    });
    return;
  }

  // Skip message subtypes (edits, deletions, etc.)
  if (msg.subtype) {
    logger.debug({
      event: 'dm_skipped',
      reason: 'subtype',
      subtype: msg.subtype,
      channelId,
      messageTs,
    });
    return;
  }

  // Event deduplication
  if (isDuplicateEvent(channelId, messageTs, 'dm')) {
    logger.debug({
      event: 'event_dedup.skipped',
      handler: 'dm',
      channelId,
      messageTs,
    });
    return;
  }

  logger.info({
    event: 'dm_received',
    channelId,
    userId,
    messageLength: text.length,
    hasFiles: Boolean(msg.files?.length),
  });

  // Build normalized context for shared handler
  const messageContext: MessageContext = {
    channelId,
    messageTs,
    userId,
    text, // DMs don't need @mention stripping
    threadTs: msg.thread_ts, // DMs can have threads too
    isThread: false, // DMs are flat conversations by default
    channelType: 'im',
    files: msg.files,
    client: client as WebClient,
    context,
    handlerName: 'dm',
  };

  // Delegate to shared message handler
  await handleMessage(messageContext);
}
