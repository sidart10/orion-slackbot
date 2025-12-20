/**
 * Slack Vercel Serverless Function
 *
 * Handles Slack events on Vercel's serverless platform.
 * Key requirements:
 * - Acknowledge within 3 seconds (Slack requirement)
 * - Handle URL verification challenge
 * - Deduplicate retry events
 * - Wrap in Langfuse traces
 * - Verify request signatures for security
 *
 * @see Story 1.9 - Vercel Slack Integration
 * @see AC#1 - Serverless function handles Slack events
 * @see AC#2 - URL verification challenge handled
 * @see AC#3 - Acknowledge within 3 seconds
 * @see AC#4 - Duplicate events ignored via X-Slack-Retry-Num
 * @see AC#6 - Errors wrapped in OrionError
 * @see AC#7 - Langfuse tracing
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { startActiveObservation } from '../src/observability/tracing.js';
import { createOrionError, ErrorCode, wrapError } from '../src/utils/errors.js';
import { logger } from '../src/utils/logger.js';
import { config } from '../src/config/environment.js';

/**
 * Verify Slack request signature
 *
 * Slack signs all requests using HMAC-SHA256. This function verifies the signature
 * to ensure requests are genuinely from Slack.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Protect against replay attacks — reject requests older than 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false;
  }

  // Compute expected signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // Lengths don't match
    return false;
  }
}

// Singleton WebClient to avoid per-request instantiation (Story 1.9 anti-pattern)
const slackClient = new WebClient(config.slackBotToken);

/**
 * Slack event payload types
 */
interface SlackEvent {
  type: string;
  user?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
}

interface SlackEventPayload {
  type: string;
  challenge?: string;
  event?: SlackEvent;
  team_id?: string;
  event_id?: string;
}

/**
 * Post error message to Slack thread (AC#6 - user-friendly error delivery)
 * Fire-and-forget: doesn't throw, doesn't block
 */
async function postErrorToThread(
  channel: string,
  threadTs: string,
  userMessage: string
): Promise<void> {
  try {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `_${userMessage}_`,
    });
  } catch (postError) {
    logger.error({
      event: 'slack_error_notification_failed',
      error: postError instanceof Error ? postError.message : 'Unknown',
      channel,
      threadTs,
    });
  }
}

/**
 * Vercel serverless handler for Slack webhooks
 *
 * TIMING STRATEGY (AC#3):
 * Return 200 to Slack IMMEDIATELY after validation, then process async.
 * This prevents Slack retries if Slack Web API is slow.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const body = req.body as SlackEventPayload;

  // 1. Handle URL verification challenge (AC#2)
  // This must happen BEFORE any other processing — no trace needed
  if (body?.type === 'url_verification') {
    res.status(200).json({ challenge: body.challenge });
    return;
  }

  // 2. Verify Slack request signature FIRST for security
  // SECURITY: Signature must be verified BEFORE any other processing including retry check
  // This prevents attackers from forging requests with X-Slack-Retry-Num header
  const signingSecret = config.slackSigningSecret;
  if (signingSecret) {
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const signature = req.headers['x-slack-signature'] as string;

    if (!timestamp || !signature) {
      logger.warn({
        event: 'slack_signature_missing',
        hasTimestamp: !!timestamp,
        hasSignature: !!signature,
      });
      res.status(401).json({ error: 'Missing signature headers' });
      return;
    }

    // Get raw body for signature verification
    // Prefer platform-provided raw body if available.
    // Fallback to JSON.stringify only as a last resort (may mismatch Slack's exact bytes).
    const anyReq = req as unknown as { rawBody?: unknown };
    let rawBody: string;
    if (typeof anyReq.rawBody === 'string') {
      rawBody = anyReq.rawBody;
    } else if (Buffer.isBuffer(anyReq.rawBody)) {
      rawBody = anyReq.rawBody.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else {
      rawBody = JSON.stringify(body);
      logger.warn({
        event: 'slack_signature_raw_body_unavailable',
        note: 'using_json_stringify_fallback',
        contentType: req.headers['content-type'],
      });
    }

    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      const orionError = createOrionError(
        ErrorCode.SLACK_SIGNATURE_INVALID,
        'Slack request signature verification failed'
      );
      logger.error({
        event: 'slack_signature_invalid',
        errorCode: orionError.code,
        timestamp,
      });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  // 3. Handle duplicate events via X-Slack-Retry-Num header (AC#4)
  // Now checked AFTER signature verification for security
  const retryNum = req.headers['x-slack-retry-num'];
  if (retryNum) {
    logger.info({
      event: 'slack_duplicate_event_ignored',
      retryNum: retryNum as string,
      retryReason: req.headers['x-slack-retry-reason'] as string | undefined,
    });
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  // 4. IMMEDIATELY return 200 to Slack (AC#3 - prevents retries)
  // Process event asynchronously after response is sent
  res.status(200).json({ ok: true });

  // 5. Fire-and-forget event processing with tracing (AC#7)
  // Response already sent - this runs async
  const event = body.event;
  const channel = event?.channel;
  const threadTs = event?.thread_ts || event?.ts;

  try {
    await startActiveObservation(
      {
        name: 'slack-webhook-handler',
        userId: body.event?.user,
        sessionId: threadTs,
        metadata: {
          channel,
          threadTs,
          eventType: event?.type,
          teamId: body.team_id,
          eventId: body.event_id,
        },
      },
      async (trace) => {
        // Log event received
        logger.info({
          event: 'slack_event_received',
          eventType: event?.type,
          channel,
          userId: event?.user,
        });

        // Handle app_mention events (AC#3)
        if (event?.type === 'app_mention' && channel && event.ts) {
          try {
            // Post "Processing..." message
            const thinkingMsg = await slackClient.chat.postMessage({
              channel,
              thread_ts: threadTs!,
              text: '_Processing your request..._',
            });

            logger.info({
              event: 'slack_ack_sent',
              channel,
              threadTs,
              messageTs: thinkingMsg.ts,
            });

            // STUB: Async sandbox execution (Story 3-0 will implement)
            // For now, update with placeholder message after short delay
            //
            // ⚠️ FIRE-AND-FORGET PATTERN: This setTimeout callback may not complete
            // if the Vercel function terminates first. Acceptable for stub behavior.
            // Story 3-0 replaces this with proper sandbox invocation.
            setTimeout(async () => {
              try {
                if (thinkingMsg.ts) {
                  await slackClient.chat.update({
                    channel,
                    ts: thinkingMsg.ts,
                    text: '_Sandbox integration pending (Story 3-0)_',
                  });
                }
              } catch (updateError) {
                logger.error({
                  event: 'slack_message_update_failed',
                  error: updateError instanceof Error ? updateError.message : 'Unknown',
                  channel,
                  messageTs: thinkingMsg.ts,
                });
              }
            }, 1000);
          } catch (postError) {
            // Log and try to notify user in thread (AC#6)
            const orionError = createOrionError(
              ErrorCode.SLACK_ACK_TIMEOUT,
              postError instanceof Error ? postError.message : 'Failed to post acknowledgment'
            );
            logger.error({
              event: 'slack_ack_failed',
              errorCode: orionError.code,
              message: orionError.message,
            });
          }
        }

        trace.update({
          output: { status: 'acknowledged', eventType: event?.type },
        });
      }
    );
  } catch (error) {
    // Wrap error in OrionError (AC#6)
    const orionError = wrapError(error, ErrorCode.SLACK_HANDLER_FAILED);

    logger.error({
      event: 'slack_handler_error',
      errorCode: orionError.code,
      message: orionError.message,
      recoverable: orionError.recoverable,
    });

    // Try to notify user in thread if we have channel info (AC#6)
    if (channel && threadTs) {
      await postErrorToThread(
        channel,
        threadTs,
        'Sorry, something went wrong. Please try again.'
      );
    }
  }
}

