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
import type { IncomingMessage } from 'http';
import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { startActiveObservation } from '../src/observability/tracing.js';
import { createOrionError, ErrorCode, wrapError } from '../src/utils/errors.js';
import { logger } from '../src/utils/logger.js';
import { config as envConfig } from '../src/config/environment.js';
import {
  fetchThreadHistory,
  formatThreadHistoryForAgent,
  THREAD_HISTORY_LIMIT,
} from '../src/slack/thread-context.js';
import { executeAgentInSandbox } from '../src/sandbox/index.js';

/**
 * Disable Vercel's automatic body parsing to preserve raw body for signature verification.
 * This is REQUIRED for Slack signature verification to work correctly.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Read raw body from request stream.
 * Required when bodyParser is disabled.
 */
async function getRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Regex to match Slack user mention format: <@U123ABC>
 * Used to strip the bot mention from app_mention text.
 */
const MENTION_REGEX = /<@[A-Z0-9]+>/gi;

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
const slackClient = new WebClient(envConfig.slackBotToken);

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
  // Read raw body FIRST (before any parsing) for signature verification
  // This is required because we disabled Vercel's bodyParser
  const rawBody = await getRawBody(req);
  let body: SlackEventPayload;
  
  try {
    body = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    logger.error({ event: 'json_parse_failed', rawBodyLen: rawBody.length });
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  // #region agent log
  const debugH1H2 = {location:'api/slack.ts:139',message:'Handler entry - request received',data:{method:req.method,hasBody:!!body,bodyType:body?.type,eventType:body?.event?.type,hasSignature:!!req.headers['x-slack-signature'],hasTimestamp:!!req.headers['x-slack-request-timestamp'],rawBodyLen:rawBody.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'};
  console.log('[DEBUG]', JSON.stringify(debugH1H2));
  fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH1H2)}).catch(()=>{});
  // #endregion

  // 1. Handle URL verification challenge (AC#2)
  // This must happen BEFORE any other processing — no trace needed
  if (body?.type === 'url_verification') {
    res.status(200).json({ challenge: body.challenge });
    return;
  }

  // 2. Verify Slack request signature FIRST for security
  // SECURITY: Signature must be verified BEFORE any other processing including retry check
  // This prevents attackers from forging requests with X-Slack-Retry-Num header
  const signingSecret = envConfig.slackSigningSecret;
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

    // Use the raw body string directly for signature verification
    // This preserves the exact bytes Slack sent, ensuring signature match
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      // #region agent log
      const debugH2Fail = {location:'api/slack.ts:188',message:'Signature verification FAILED',data:{rawBodyLen:rawBody?.length,signaturePrefix:signature?.slice(0,20)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'};
      console.log('[DEBUG]', JSON.stringify(debugH2Fail));
      fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH2Fail)}).catch(()=>{});
      // #endregion
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
    // #region agent log
    const debugH2Pass = {location:'api/slack.ts:200',message:'Signature verification PASSED',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'};
    console.log('[DEBUG]', JSON.stringify(debugH2Pass));
    fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH2Pass)}).catch(()=>{});
    // #endregion
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
            const effectiveThreadTs = event.thread_ts ?? event.ts;

            // Extract query by removing the @mention
            const query = (event.text ?? '').replace(MENTION_REGEX, '').trim();

            // If empty query after removing mention, respond with a helpful prompt
            if (!query) {
              await slackClient.chat.postMessage({
                channel,
                thread_ts: effectiveThreadTs,
                text: "Hi! I'm Orion. How can I help you?",
              });
              return;
            }

            // Post "Processing..." message
            const thinkingMsg = await slackClient.chat.postMessage({
              channel,
              thread_ts: effectiveThreadTs,
              text: '_Processing your request..._',
            });

            logger.info({
              event: 'slack_ack_sent',
              channel,
              threadTs,
              messageTs: thinkingMsg.ts,
            });

            // Story 3-0: Execute Orion in Vercel Sandbox and update the Slack message
            if (!thinkingMsg.ts) {
              throw new Error('Failed to get message timestamp for sandbox callback');
            }

            const threadHistory = event.thread_ts
              ? await fetchThreadHistory({
                  client: slackClient,
                  channel,
                  threadTs: event.thread_ts,
                  limit: THREAD_HISTORY_LIMIT,
                })
              : [];

            // #region agent log
            const debugH345Pre = {location:'api/slack.ts:294',message:'About to call executeAgentInSandbox',data:{queryLen:query?.length,channel,messageTs:thinkingMsg.ts,hasSlackToken:!!envConfig.slackBotToken},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4,H5'};
            console.log('[DEBUG]', JSON.stringify(debugH345Pre));
            fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH345Pre)}).catch(()=>{});
            // #endregion
            const sandboxResult = await executeAgentInSandbox({
              userMessage: query,
              threadHistory: formatThreadHistoryForAgent(threadHistory),
              slackChannel: channel,
              slackMessageTs: thinkingMsg.ts,
              slackToken: envConfig.slackBotToken,
              traceId: trace.id,
            });
            // #region agent log
            const debugH345Post = {location:'api/slack.ts:305',message:'executeAgentInSandbox returned',data:{success:sandboxResult.success,duration:sandboxResult.duration,errorCode:sandboxResult.errorCode,hasResponse:!!sandboxResult.response},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4,H5'};
            console.log('[DEBUG]', JSON.stringify(debugH345Post));
            fetch('http://127.0.0.1:7243/ingest/66e4f380-14c2-4255-8e1b-248713cf36a1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugH345Post)}).catch(()=>{});
            // #endregion

            logger.info({
              event: 'sandbox_invocation_completed',
              channel,
              threadTs: effectiveThreadTs,
              messageTs: thinkingMsg.ts,
              success: sandboxResult.success,
              duration: sandboxResult.duration,
              traceId: trace.id,
            });

            if (!sandboxResult.success) {
              // Sandbox should have updated Slack with an error message, but ensure fallback
              await slackClient.chat.update({
                channel,
                ts: thinkingMsg.ts,
                text:
                  sandboxResult.error ??
                  'Sorry, I encountered an error processing your message.',
              });
            }
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

