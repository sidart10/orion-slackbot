/**
 * Group DM Handler
 *
 * Handles messages in group DMs (multi-person DMs) that include the Orion bot.
 * Uses the shared message handler core for consistent behavior.
 *
 * @see PLAN-dm-group-dm-support.md - Task 3: Create Group DM Handler
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
 * Handles messages in group DMs with the Orion bot.
 *
 * This handler:
 * - Filters for 'mpim' channel type only
 * - Skips bot messages to prevent loops
 * - Skips message subtypes (edits, deletions)
 * - Uses event deduplication
 * - Delegates to shared message handler core
 *
 * Note: Unlike channel mentions, group DMs respond to ALL messages,
 * not just @mentions. This matches typical bot behavior in group DMs.
 *
 * @see PLAN-dm-group-dm-support.md
 */
export async function handleGroupDm({
  message,
  event,
  client,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>): Promise<void> {
  // Use message or event - Bolt provides both
  const msg = (message ?? event) as MessageEvent;

  // Filter for group DM channel type only
  if (msg.channel_type !== 'mpim') {
    return;
  }

  const channelId = msg.channel;
  const messageTs = msg.ts;
  const userId = msg.user ?? '';
  const text = msg.text ?? '';

  // Skip bot messages to prevent loops
  if (msg.bot_id) {
    logger.debug({
      event: 'group_dm_skipped',
      reason: 'bot_message',
      channelId,
      messageTs,
    });
    return;
  }

  // Skip message subtypes (edits, deletions, etc.)
  if (msg.subtype) {
    logger.debug({
      event: 'group_dm_skipped',
      reason: 'subtype',
      subtype: msg.subtype,
      channelId,
      messageTs,
    });
    return;
  }

  // Event deduplication
  if (isDuplicateEvent(channelId, messageTs, 'group_dm')) {
    logger.debug({
      event: 'event_dedup.skipped',
      handler: 'group_dm',
      channelId,
      messageTs,
    });
    return;
  }

  logger.info({
    event: 'group_dm_received',
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
    text, // Group DMs don't need @mention stripping
    threadTs: msg.thread_ts, // Group DMs can have threads too
    isThread: false, // Group DMs are flat conversations by default
    channelType: 'mpim',
    files: msg.files,
    client: client as WebClient,
    context,
    handlerName: 'group_dm',
  };

  // Delegate to shared message handler
  await handleMessage(messageContext);
}
