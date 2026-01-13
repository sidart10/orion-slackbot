/**
 * Unit Tests for StatusUpdater Module
 *
 * Tests for:
 * - AssistantStatusUpdater (wraps setStatus callback)
 * - ChannelStatusUpdater (uses chat.postMessage/update/delete with 300ms debounce)
 * - createStatusUpdater factory function
 *
 * @see Story 7.9 - Unified StatusUpdater
 * @see AC#7 - Unit tests covering both implementations, factory selection, debounce behavior, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebClient } from '@slack/web-api';
import {
  createStatusUpdater,
  AssistantStatusUpdater,
  ChannelStatusUpdater,
} from '@/slack/status/index.js';
import type { StatusUpdater, StatusContext, SetStatusFn } from '@/slack/status/types.js';

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '@/utils/logger.js';

describe('StatusUpdater Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===== AssistantStatusUpdater Tests =====
  describe('AssistantStatusUpdater', () => {
    describe('update()', () => {
      it('calls setStatus with loading_messages array', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus, 'trace-123');

        await updater.update('Searching...');

        expect(mockSetStatus).toHaveBeenCalledWith({
          status: 'working...',
          loading_messages: ['Searching...'],
        });
      });

      it('sets active state to true after update', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus);

        expect(updater.isActive()).toBe(false);
        await updater.update('Status');
        expect(updater.isActive()).toBe(true);
      });

      it('handles sync setStatus callback (returns void)', async () => {
        const mockSetStatusSync: SetStatusFn = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatusSync);

        await expect(updater.update('Status')).resolves.toBeUndefined();
        expect(mockSetStatusSync).toHaveBeenCalled();
      });

      it('handles async setStatus callback (returns Promise)', async () => {
        const mockSetStatusAsync = vi.fn().mockResolvedValue(undefined);
        const updater = new AssistantStatusUpdater(mockSetStatusAsync);

        await expect(updater.update('Status')).resolves.toBeUndefined();
        expect(mockSetStatusAsync).toHaveBeenCalled();
      });

      it('catches and logs errors without throwing', async () => {
        const error = new Error('setStatus failed');
        const mockSetStatus = vi.fn().mockRejectedValue(error);
        const updater = new AssistantStatusUpdater(mockSetStatus, 'trace-456');

        await expect(updater.update('Status')).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith({
          event: 'status_update_failed',
          updater: 'assistant',
          error: 'setStatus failed',
          traceId: 'trace-456',
        });
      });

      it('catches sync throw errors without throwing', async () => {
        const mockSetStatus = vi.fn().mockImplementation(() => {
          throw new Error('Sync error');
        });
        const updater = new AssistantStatusUpdater(mockSetStatus, 'trace-789');

        await expect(updater.update('Status')).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith({
          event: 'status_update_failed',
          updater: 'assistant',
          error: 'Sync error',
          traceId: 'trace-789',
        });
      });
    });

    describe('cleanup()', () => {
      it('calls setStatus with empty string after update', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus);

        await updater.update('Status');
        await updater.cleanup();

        expect(mockSetStatus).toHaveBeenCalledTimes(2);
        expect(mockSetStatus).toHaveBeenLastCalledWith({ status: '' });
      });

      it('sets active state to false after cleanup', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus);

        await updater.update('Status');
        expect(updater.isActive()).toBe(true);

        await updater.cleanup();
        expect(updater.isActive()).toBe(false);
      });

      it('is no-op if update was never called', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus);

        await updater.cleanup();

        expect(mockSetStatus).not.toHaveBeenCalled();
      });

      it('catches and logs errors without throwing', async () => {
        const mockSetStatus = vi.fn()
          .mockResolvedValueOnce(undefined) // First call (update) succeeds
          .mockRejectedValueOnce(new Error('Cleanup failed')); // Second call (cleanup) fails
        const updater = new AssistantStatusUpdater(mockSetStatus, 'trace-cleanup');

        await updater.update('Status');
        await expect(updater.cleanup()).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledWith({
          event: 'status_cleanup_failed',
          updater: 'assistant',
          error: 'Cleanup failed',
          traceId: 'trace-cleanup',
        });
        expect(updater.isActive()).toBe(false);
      });
    });

    describe('isActive()', () => {
      it('returns correct state through lifecycle', async () => {
        const mockSetStatus = vi.fn();
        const updater = new AssistantStatusUpdater(mockSetStatus);

        // Initial state
        expect(updater.isActive()).toBe(false);

        // After update
        await updater.update('Status 1');
        expect(updater.isActive()).toBe(true);

        // After another update
        await updater.update('Status 2');
        expect(updater.isActive()).toBe(true);

        // After cleanup
        await updater.cleanup();
        expect(updater.isActive()).toBe(false);
      });
    });
  });

  // ===== ChannelStatusUpdater Tests =====
  describe('ChannelStatusUpdater', () => {
    const createMockWebClient = () => ({
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: '123.456' }),
        update: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
    } as unknown as WebClient);

    describe('update()', () => {
      it('posts message on first call', async () => {
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456',
          'trace-post'
        );

        await updater.update('Searching...');

        expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
          channel: 'C123456',
          thread_ts: '1234567890.123456',
          text: 'Searching...',
        });
        expect(mockClient.chat.update).not.toHaveBeenCalled();
      });

      it('updates existing message on subsequent calls (after debounce)', async () => {
        vi.useFakeTimers();
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        // First call - posts message
        await updater.update('Status 1');
        expect(mockClient.chat.postMessage).toHaveBeenCalledTimes(1);

        // Advance time past debounce
        vi.advanceTimersByTime(300);

        // Second call - updates message
        await updater.update('Status 2');
        expect(mockClient.chat.update).toHaveBeenCalledWith({
          channel: 'C123456',
          ts: '123.456',
          text: 'Status 2',
        });
      });

      it('debounces rapid updates (within 300ms)', async () => {
        vi.useFakeTimers();
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        // First call - posts message
        await updater.update('Status 1');
        expect(mockClient.chat.postMessage).toHaveBeenCalledTimes(1);

        // Rapid update (within 300ms) - should be skipped
        vi.advanceTimersByTime(100);
        await updater.update('Status 2');
        expect(mockClient.chat.update).not.toHaveBeenCalled();

        // Another rapid update
        vi.advanceTimersByTime(100);
        await updater.update('Status 3');
        expect(mockClient.chat.update).not.toHaveBeenCalled();

        // After debounce period
        vi.advanceTimersByTime(300);
        await updater.update('Status 4');
        expect(mockClient.chat.update).toHaveBeenCalledTimes(1);
        expect(mockClient.chat.update).toHaveBeenCalledWith({
          channel: 'C123456',
          ts: '123.456',
          text: 'Status 4',
        });
      });

      it('first update is not debounced', async () => {
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        await updater.update('First status');

        expect(mockClient.chat.postMessage).toHaveBeenCalledTimes(1);
        expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
          channel: 'C123456',
          thread_ts: '1234567890.123456',
          text: 'First status',
        });
      });

      it('catches postMessage errors without throwing', async () => {
        const mockClient = createMockWebClient();
        (mockClient.chat.postMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Post failed')
        );
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456',
          'trace-post-fail'
        );

        await expect(updater.update('Status')).resolves.toBeUndefined();
        expect(logger.debug).toHaveBeenCalledWith({
          event: 'status_update_failed',
          updater: 'channel',
          operation: 'postMessage',
          error: 'Post failed',
          traceId: 'trace-post-fail',
        });
      });

      it('catches update errors without throwing', async () => {
        vi.useFakeTimers();
        const mockClient = createMockWebClient();
        (mockClient.chat.update as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Update failed')
        );
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456',
          'trace-update-fail'
        );

        // First call succeeds (postMessage)
        await updater.update('Status 1');
        vi.advanceTimersByTime(300);

        // Second call (update) fails gracefully
        await expect(updater.update('Status 2')).resolves.toBeUndefined();
        expect(logger.debug).toHaveBeenCalledWith({
          event: 'status_update_failed',
          updater: 'channel',
          operation: 'update',
          error: 'Update failed',
          traceId: 'trace-update-fail',
        });
      });
    });

    describe('cleanup()', () => {
      it('deletes the status message', async () => {
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        await updater.update('Status');
        await updater.cleanup();

        expect(mockClient.chat.delete).toHaveBeenCalledWith({
          channel: 'C123456',
          ts: '123.456',
        });
      });

      it('sets active state to false after cleanup', async () => {
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        await updater.update('Status');
        expect(updater.isActive()).toBe(true);

        await updater.cleanup();
        expect(updater.isActive()).toBe(false);
      });

      it('is no-op if update was never called', async () => {
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        await updater.cleanup();

        expect(mockClient.chat.delete).not.toHaveBeenCalled();
      });

      it('catches delete errors without throwing', async () => {
        const mockClient = createMockWebClient();
        (mockClient.chat.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Delete failed')
        );
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456',
          'trace-delete-fail'
        );

        await updater.update('Status');
        await expect(updater.cleanup()).resolves.toBeUndefined();

        expect(logger.debug).toHaveBeenCalledWith({
          event: 'status_cleanup_failed',
          updater: 'channel',
          error: 'Delete failed',
          traceId: 'trace-delete-fail',
        });
        expect(updater.isActive()).toBe(false);
      });
    });

    describe('isActive()', () => {
      it('returns correct state through lifecycle', async () => {
        vi.useFakeTimers();
        const mockClient = createMockWebClient();
        const updater = new ChannelStatusUpdater(
          mockClient,
          'C123456',
          '1234567890.123456'
        );

        // Initial state
        expect(updater.isActive()).toBe(false);

        // After update
        await updater.update('Status');
        expect(updater.isActive()).toBe(true);

        // After cleanup
        await updater.cleanup();
        expect(updater.isActive()).toBe(false);
      });
    });
  });

  // ===== Factory Function Tests =====
  describe('createStatusUpdater()', () => {
    const createMockWebClient = () => ({
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: '123.456' }),
        update: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
    } as unknown as WebClient);

    it('returns AssistantStatusUpdater when setStatus is provided', async () => {
      const mockSetStatus = vi.fn();
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        setStatus: mockSetStatus,
        client: mockClient,
        channel: 'D123456',
        thread_ts: '1234567890.123456',
        traceId: 'trace-factory-1',
      };

      const updater = createStatusUpdater(context);

      // Verify it's an AssistantStatusUpdater by checking behavior
      await updater.update('Status');
      expect(mockSetStatus).toHaveBeenCalledWith({
        status: 'working...',
        loading_messages: ['Status'],
      });
      expect(mockClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it('returns ChannelStatusUpdater when setStatus is not provided', async () => {
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        // No setStatus
        client: mockClient,
        channel: 'C123456',
        thread_ts: '1234567890.123456',
        traceId: 'trace-factory-2',
      };

      const updater = createStatusUpdater(context);

      // Verify it's a ChannelStatusUpdater by checking behavior
      await updater.update('Status');
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123456',
        thread_ts: '1234567890.123456',
        text: 'Status',
      });
    });

    it('is synchronous (returns immediately, not a Promise)', () => {
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        client: mockClient,
        channel: 'C123456',
        thread_ts: '1234567890.123456',
      };

      const result = createStatusUpdater(context);

      // Verify it's not a Promise
      expect(result).not.toBeInstanceOf(Promise);
      // Verify it's a StatusUpdater
      expect(typeof result.update).toBe('function');
      expect(typeof result.cleanup).toBe('function');
      expect(typeof result.isActive).toBe('function');
    });

    it('passes traceId to AssistantStatusUpdater', async () => {
      const mockSetStatus = vi.fn().mockRejectedValue(new Error('Test error'));
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        setStatus: mockSetStatus,
        client: mockClient,
        channel: 'D123456',
        thread_ts: '1234567890.123456',
        traceId: 'trace-id-assistant',
      };

      const updater = createStatusUpdater(context);
      await updater.update('Status');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'trace-id-assistant',
        })
      );
    });

    it('passes traceId to ChannelStatusUpdater', async () => {
      const mockClient = createMockWebClient();
      (mockClient.chat.postMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Test error')
      );

      const context: StatusContext = {
        client: mockClient,
        channel: 'C123456',
        thread_ts: '1234567890.123456',
        traceId: 'trace-id-channel',
      };

      const updater = createStatusUpdater(context);
      await updater.update('Status');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'trace-id-channel',
        })
      );
    });

    it('return type is StatusUpdater interface', () => {
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        client: mockClient,
        channel: 'C123456',
        thread_ts: '1234567890.123456',
      };

      // Type check - this should compile without errors
      const updater: StatusUpdater = createStatusUpdater(context);

      expect(updater).toBeDefined();
      expect(typeof updater.update).toBe('function');
      expect(typeof updater.cleanup).toBe('function');
      expect(typeof updater.isActive).toBe('function');
    });

    it('handles minimal StatusContext (only required fields)', async () => {
      const mockClient = createMockWebClient();

      const context: StatusContext = {
        client: mockClient,
        channel: 'C123456',
        thread_ts: '1234567890.123456',
        // No setStatus, no traceId
      };

      const updater = createStatusUpdater(context);

      // Should not throw
      await expect(updater.update('Status')).resolves.toBeUndefined();
      await expect(updater.cleanup()).resolves.toBeUndefined();
    });
  });

  // ===== Type Tests =====
  describe('Type Safety', () => {
    it('StatusUpdater interface has required methods', () => {
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ts: '123' }),
          update: vi.fn().mockResolvedValue({ ok: true }),
          delete: vi.fn().mockResolvedValue({ ok: true }),
        },
      } as unknown as WebClient;

      const updater: StatusUpdater = new ChannelStatusUpdater(
        mockClient,
        'C123',
        '123.456'
      );

      // These should all exist and be callable
      expect(typeof updater.update).toBe('function');
      expect(typeof updater.cleanup).toBe('function');
      expect(typeof updater.isActive).toBe('function');
    });

    it('StatusContext accepts optional setStatus', () => {
      const mockClient = {
        chat: {
          postMessage: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      } as unknown as WebClient;

      // With setStatus
      const withSetStatus: StatusContext = {
        setStatus: vi.fn(),
        client: mockClient,
        channel: 'D123',
        thread_ts: '123.456',
      };

      // Without setStatus
      const withoutSetStatus: StatusContext = {
        client: mockClient,
        channel: 'C123',
        thread_ts: '123.456',
      };

      expect(withSetStatus.setStatus).toBeDefined();
      expect(withoutSetStatus.setStatus).toBeUndefined();
    });
  });
});
