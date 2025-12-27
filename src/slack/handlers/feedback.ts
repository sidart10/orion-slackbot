/**
 * Feedback Action Handler
 *
 * Handles user feedback button clicks (thumbs up/down) on Orion responses.
 * Logs feedback to Langfuse for quality tracking and analytics.
 *
 * @see FR48 - User feedback via Slack's native feedback_buttons
 * @see FR49 - Feedback logging to Langfuse
 * @see Story 1.8 - Feedback Button Infrastructure
 */

import type {
  BlockAction,
  AllMiddlewareArgs,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { logFeedbackScore } from '../../observability/langfuse.js';
import { getTraceIdFromMessageTs } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

type FeedbackActionArgs = SlackActionMiddlewareArgs<BlockAction> &
  AllMiddlewareArgs;

/**
 * Handle feedback button clicks.
 *
 * Flow:
 * 1. Acknowledge action immediately (Slack 3s timeout)
 * 2. Extract feedback value and message context
 * 3. Look up trace ID from cache or message metadata
 * 4. Log score to Langfuse (or orphan event if no trace)
 * 5. Send ephemeral acknowledgment to user
 *
 * @see AC#1 - Feedback logged to Langfuse as score
 * @see AC#3 - Positive feedback shows ephemeral acknowledgment
 * @see AC#4 - Negative feedback shows suggestions
 * @see AC#7 - Orphan feedback logged as event
 */
export async function handleFeedback({
  ack,
  body,
  client,
}: FeedbackActionArgs): Promise<void> {
  // Always acknowledge first to satisfy Slack's 3s timeout
  await ack();

  const action = body.actions[0];
  if (!action || !('value' in action)) {
    logger.warn({ event: 'feedback.invalid_action', body: JSON.stringify(body) });
    return;
  }

  const messageTs = body.message?.ts ?? '';
  const channelId = body.channel?.id ?? '';
  const userId = body.user.id;
  const teamId = body.team?.id;
  const isPositive = action.value === 'positive';

  // Dual lookup: cache first, then Slack metadata fallback
  let traceId: string | null = getTraceIdFromMessageTs(messageTs);
  if (!traceId && body.message?.metadata?.event_payload) {
    const payload = body.message.metadata.event_payload as { traceId?: string };
    traceId = payload.traceId ?? null;
  }

  // Log feedback to Langfuse using centralized helper
  try {
    const result = await logFeedbackScore({
      isPositive,
      traceId,
      userId,
      channelId,
      messageTs,
      teamId,
    });

    if (result.scored) {
      logger.info({
        event: 'feedback.logged',
        isPositive,
        traceId,
        userId,
        channelId,
      });
    } else if (result.orphan) {
      logger.warn({
        event: 'feedback.orphan',
        isPositive,
        messageTs,
        userId,
        channelId,
        reason: 'trace_not_found',
      });
    }
  } catch (error) {
    logger.error({
      event: 'feedback.logging_failed',
      error: error instanceof Error ? error.message : String(error),
      messageTs,
      userId,
    });
  }

  // Send ephemeral acknowledgment to user
  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: isPositive
        ? "Thanks for the feedback! 👍"
        : "Sorry this wasn't helpful. Starting a new thread may help with mistakes.",
    });
  } catch (error) {
    logger.error({
      event: 'feedback.ephemeral_failed',
      error: error instanceof Error ? error.message : String(error),
      userId,
      channelId,
    });
  }
}

