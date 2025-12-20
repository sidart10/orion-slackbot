/**
 * Tests for Slack Vercel Serverless Function
 *
 * @see Story 1.9 - Vercel Slack Integration
 * @see AC#1 - Serverless function handles Slack events
 * @see AC#2 - URL verification challenge handled
 * @see AC#3 - Acknowledge within 3 seconds
 * @see AC#4 - Duplicate events ignored via X-Slack-Retry-Num
 * @see AC#6 - Errors wrapped in OrionError
 * @see AC#7 - Langfuse tracing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const TEST_SIGNING_SECRET = 'test-signing-secret';

/**
 * Generate valid Slack signature for test requests
 */
function generateSlackSignature(body: unknown): { timestamp: string; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', TEST_SIGNING_SECRET);
  hmac.update(sigBasestring);
  const signature = `v0=${hmac.digest('hex')}`;
  return { timestamp, signature };
}

// Mock Slack WebClient
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.999999' });
const mockUpdate = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockPostMessage,
      update: mockUpdate,
    },
  })),
}));

// Mock modules before imports
vi.mock('../src/observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (_ctx, fn) => {
    const mockTrace = {
      id: 'test-trace-id',
      traceId: 'test-trace-id',
      update: vi.fn(),
      span: vi.fn(() => ({ end: vi.fn() })),
      generation: vi.fn(),
    };
    return fn(mockTrace);
  }),
}));

vi.mock('../src/config/environment.js', () => ({
  config: {
    slackBotToken: 'xoxb-test-token',
    slackSigningSecret: 'test-signing-secret',
    slackAppToken: undefined,
    nodeEnv: 'test',
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock request with valid Slack signature
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  const body = overrides.body ?? {};
  const { timestamp, signature } = generateSlackSignature(body);

  return {
    method: 'POST',
    headers: {
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
      ...overrides.headers,
    },
    body,
    query: {},
    cookies: {},
    ...overrides,
  } as unknown as VercelRequest;
}

// Helper to create mock response
function createMockResponse(): VercelResponse & {
  _status: number;
  _json: unknown;
  _sent: boolean;
} {
  const res = {
    _status: 200,
    _json: null as unknown,
    _sent: false,
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, data: unknown) {
      this._json = data;
      this._sent = true;
      return this;
    }),
    send: vi.fn(function (this: typeof res) {
      this._sent = true;
      return this;
    }),
  };
  return res as unknown as VercelResponse & {
    _status: number;
    _json: unknown;
    _sent: boolean;
  };
}

describe('Slack API Route', () => {
  let handler: typeof import('./slack.js').default;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPostMessage.mockClear();
    mockUpdate.mockClear();
    const module = await import('./slack.js');
    handler = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AC#2: URL Verification Challenge', () => {
    it('should respond with challenge token for url_verification', async () => {
      const req = createMockRequest({
        body: {
          type: 'url_verification',
          challenge: 'test-challenge-token-123',
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ challenge: 'test-challenge-token-123' });
    });

    it('should handle url_verification before any other processing', async () => {
      const { startActiveObservation } = await import('../src/observability/tracing.js');

      const req = createMockRequest({
        body: {
          type: 'url_verification',
          challenge: 'early-challenge',
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      // URL verification should NOT create a trace (optimized path)
      expect(startActiveObservation).not.toHaveBeenCalled();
      expect(res._json).toEqual({ challenge: 'early-challenge' });
    });
  });

  describe('AC#4: Duplicate Event Handling', () => {
    it('should return 200 immediately for retry events (after signature check)', async () => {
      const body = {
        type: 'event_callback',
        event: { type: 'app_mention' },
      };
      const { timestamp, signature } = generateSlackSignature(body);

      const req = createMockRequest({
        headers: {
          'x-slack-retry-num': '1',
          'x-slack-retry-reason': 'timeout',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ ok: true, duplicate: true });
    });

    it('should log duplicate event info', async () => {
      const { logger } = await import('../src/utils/logger.js');

      const body = { type: 'event_callback' };
      const { timestamp, signature } = generateSlackSignature(body);

      const req = createMockRequest({
        headers: {
          'x-slack-retry-num': '2',
          'x-slack-retry-reason': 'http_timeout',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'slack_duplicate_event_ignored',
          retryNum: '2',
          retryReason: 'http_timeout',
        })
      );
    });

    it('should not process event when X-Slack-Retry-Num is present', async () => {
      const { startActiveObservation } = await import('../src/observability/tracing.js');

      const body = {
        type: 'event_callback',
        event: { type: 'app_mention', user: 'U123' },
      };
      const { timestamp, signature } = generateSlackSignature(body);

      const req = createMockRequest({
        headers: {
          'x-slack-retry-num': '1',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body,
      });
      const res = createMockResponse();

      await handler(req, res);

      // Should skip trace for duplicate events
      expect(startActiveObservation).not.toHaveBeenCalled();
    });

    it('should verify signature even for retry events (security)', async () => {
      // Retry request with INVALID signature should be rejected
      const req = {
        method: 'POST',
        headers: {
          'x-slack-retry-num': '1',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=invalid_forged_signature',
        },
        body: { type: 'event_callback' },
        query: {},
        cookies: {},
      } as unknown as VercelRequest;
      const res = createMockResponse();

      await handler(req, res);

      // Should reject with 401 (signature checked before retry check)
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid signature' });
    });
  });

  describe('AC#7: Langfuse Tracing', () => {
    it('should wrap event processing in Langfuse trace', async () => {
      const { startActiveObservation } = await import('../src/observability/tracing.js');

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            thread_ts: '1234567890.000000',
            text: '<@UBOT> hello',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(startActiveObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'slack-webhook-handler',
          userId: 'U123',
          metadata: expect.objectContaining({
            channel: 'C456',
            threadTs: '1234567890.000000',
            eventType: 'app_mention',
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('AC#6: Error Handling', () => {
    it('should return 200 immediately even when processing will error', async () => {
      // Force an error in event processing
      const { startActiveObservation } = await import('../src/observability/tracing.js');
      (startActiveObservation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Forced test error')
      );

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Should return 200 immediately (AC#3 timing fix)
      expect(res._status).toBe(200);
      expect(res._json).toEqual({ ok: true });
    });

    it('should log errors with structured JSON format', async () => {
      const { logger } = await import('../src/utils/logger.js');

      // Force an error in tracing callback
      const { startActiveObservation } = await import('../src/observability/tracing.js');
      (startActiveObservation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Test handler error')
      );

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            channel: 'C456',
            ts: '1234567890.123456',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'slack_handler_error',
        })
      );
    });

    it('should post error message to thread on handler failure (AC#6)', async () => {
      // Force an error in tracing
      const { startActiveObservation } = await import('../src/observability/tracing.js');
      (startActiveObservation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Test error for user notification')
      );

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            thread_ts: '1234567890.000000',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Should try to post error message to user's thread
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          thread_ts: '1234567890.000000',
          text: expect.stringContaining('Sorry'),
        })
      );
    });
  });

  describe('Request Handler Export', () => {
    it('should export a default handler function', async () => {
      const module = await import('./slack.js');
      expect(typeof module.default).toBe('function');
    });
  });

  describe('Signature Verification', () => {
    it('should reject requests with missing signature headers', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: { type: 'event_callback', event: { type: 'app_mention' } },
        query: {},
        cookies: {},
      } as unknown as VercelRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Missing signature headers' });
    });

    it('should reject requests with invalid signature', async () => {
      const req = {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=invalid_signature',
        },
        body: { type: 'event_callback', event: { type: 'app_mention' } },
        query: {},
        cookies: {},
      } as unknown as VercelRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid signature' });
    });

    it('should accept requests with valid signature', async () => {
      const body = { type: 'event_callback', event: { type: 'message' } };
      const { timestamp, signature } = generateSlackSignature(body);

      const req = {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body,
        query: {},
        cookies: {},
      } as unknown as VercelRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
    });
  });

  describe('AC#3: Immediate Acknowledgment', () => {
    it('should send 200 response before starting async processing for app_mention events', async () => {
      const { startActiveObservation } = await import('../src/observability/tracing.js');

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            text: '<@UBOT> hello',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ ok: true });

      // Deterministic ordering: response is sent before trace processing begins
      const jsonCallOrder = (res.json as any).mock.invocationCallOrder?.[0] ?? 0;
      const traceCallOrder =
        (startActiveObservation as any).mock.invocationCallOrder?.[0] ?? 0;
      expect(jsonCallOrder).toBeGreaterThan(0);
      expect(traceCallOrder).toBeGreaterThan(0);
      expect(jsonCallOrder).toBeLessThan(traceCallOrder);
    });

    it('should handle app_mention event type', async () => {
      const { logger } = await import('../src/utils/logger.js');

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            text: '<@UBOT> test question',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'slack_event_received',
          eventType: 'app_mention',
        })
      );
    });

    it('should post Processing message for app_mention', async () => {
      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            text: '<@UBOT> hello',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Should post "Processing..." message
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          thread_ts: '1234567890.123456',
          text: expect.stringContaining('Processing'),
        })
      );
    });

    it('should log acknowledgment sent', async () => {
      const { logger } = await import('../src/utils/logger.js');

      const req = createMockRequest({
        body: {
          type: 'event_callback',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C456',
            ts: '1234567890.123456',
            text: '<@UBOT> hello',
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'slack_ack_sent',
          channel: 'C456',
        })
      );
    });
  });
});

