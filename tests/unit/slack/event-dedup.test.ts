/**
 * Tests for Event Deduplication
 *
 * @see Story 7.5 - Fix Duplicate Response Bug
 * @see AC2 - Single Response Delivery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isDuplicateEvent,
  clearDedupCache,
  getDedupCacheSize,
  forceCleanup,
  CACHE_TTL,
  MAX_CACHE,
} from '@/slack/event-dedup.js';

describe('Event Deduplication', () => {
  beforeEach(() => {
    clearDedupCache();
  });

  describe('isDuplicateEvent', () => {
    it('should return false for first occurrence of an event', () => {
      const result = isDuplicateEvent('C123', '1234567890.123456', 'app_mention');
      expect(result).toBe(false);
    });

    it('should return true for duplicate event with same channel and timestamp', () => {
      // First call - not a duplicate
      isDuplicateEvent('C123', '1234567890.123456', 'app_mention');

      // Second call - IS a duplicate
      const result = isDuplicateEvent('C123', '1234567890.123456', 'assistant');
      expect(result).toBe(true);
    });

    it('should allow different messages in same channel', () => {
      isDuplicateEvent('C123', '1234567890.000001', 'app_mention');
      isDuplicateEvent('C123', '1234567890.000002', 'app_mention');

      expect(getDedupCacheSize()).toBe(2);
    });

    it('should allow same timestamp in different channels', () => {
      const result1 = isDuplicateEvent('C123', '1234567890.123456', 'app_mention');
      const result2 = isDuplicateEvent('C456', '1234567890.123456', 'app_mention');

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(getDedupCacheSize()).toBe(2);
    });

    it('should detect duplicate even with different handler IDs', () => {
      isDuplicateEvent('C123', '1234567890.123456', 'app_mention');
      const result = isDuplicateEvent('C123', '1234567890.123456', 'assistant');

      expect(result).toBe(true);
    });

    it('should track cache size correctly', () => {
      expect(getDedupCacheSize()).toBe(0);

      isDuplicateEvent('C1', '1.0', 'handler');
      expect(getDedupCacheSize()).toBe(1);

      isDuplicateEvent('C2', '2.0', 'handler');
      expect(getDedupCacheSize()).toBe(2);

      // Duplicate should not increase size
      isDuplicateEvent('C1', '1.0', 'handler');
      expect(getDedupCacheSize()).toBe(2);
    });
  });

  describe('clearDedupCache', () => {
    it('should clear all cached entries', () => {
      isDuplicateEvent('C1', '1.0', 'handler');
      isDuplicateEvent('C2', '2.0', 'handler');
      expect(getDedupCacheSize()).toBe(2);

      clearDedupCache();
      expect(getDedupCacheSize()).toBe(0);
    });

    it('should allow previously-seen events after clearing', () => {
      isDuplicateEvent('C123', '1234567890.123456', 'app_mention');
      expect(isDuplicateEvent('C123', '1234567890.123456', 'assistant')).toBe(true);

      clearDedupCache();

      // After clearing, same event should be treated as new
      expect(isDuplicateEvent('C123', '1234567890.123456', 'app_mention')).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should prevent app_mention and assistant from both processing same message', () => {
      const channelId = 'C123456';
      const messageTs = '1700000000.123456';

      // app_mention handler processes first
      const appMentionResult = isDuplicateEvent(channelId, messageTs, 'app_mention');
      expect(appMentionResult).toBe(false); // First handler should proceed

      // assistant handler tries to process same message
      const assistantResult = isDuplicateEvent(channelId, messageTs, 'assistant');
      expect(assistantResult).toBe(true); // Second handler should skip
    });

    it('should allow different messages in rapid succession', () => {
      const channelId = 'C123456';

      // User sends multiple messages quickly
      expect(isDuplicateEvent(channelId, '1700000000.000001', 'app_mention')).toBe(false);
      expect(isDuplicateEvent(channelId, '1700000000.000002', 'app_mention')).toBe(false);
      expect(isDuplicateEvent(channelId, '1700000000.000003', 'app_mention')).toBe(false);

      expect(getDedupCacheSize()).toBe(3);
    });

    it('should handle DM vs channel messages separately', () => {
      const dmChannel = 'D123456'; // DMs start with D
      const publicChannel = 'C123456'; // Channels start with C
      const messageTs = '1700000000.123456';

      expect(isDuplicateEvent(dmChannel, messageTs, 'assistant')).toBe(false);
      expect(isDuplicateEvent(publicChannel, messageTs, 'app_mention')).toBe(false);

      // Same channel+ts should be duplicate
      expect(isDuplicateEvent(dmChannel, messageTs, 'assistant')).toBe(true);
      expect(isDuplicateEvent(publicChannel, messageTs, 'assistant')).toBe(true);
    });
  });

  describe('Cache cleanup', () => {
    it('should expose cache constants for verification', () => {
      // Verify constants are exposed correctly
      expect(CACHE_TTL).toBe(5 * 60 * 1000); // 5 minutes
      expect(MAX_CACHE).toBe(1000);
    });

    it('should remove expired entries when forceCleanup is called', () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      let currentTime = 1700000000000;
      Date.now = () => currentTime;

      try {
        // Add some entries
        isDuplicateEvent('C1', '1.0', 'handler');
        isDuplicateEvent('C2', '2.0', 'handler');
        expect(getDedupCacheSize()).toBe(2);

        // Advance time past TTL (5 minutes + 1ms)
        currentTime += CACHE_TTL + 1;

        // Force cleanup
        forceCleanup();

        // All entries should be removed (they're expired)
        expect(getDedupCacheSize()).toBe(0);
      } finally {
        Date.now = originalNow;
      }
    });

    it('should keep non-expired entries during cleanup', () => {
      const originalNow = Date.now;
      let currentTime = 1700000000000;
      Date.now = () => currentTime;

      try {
        // Add first entry
        isDuplicateEvent('C1', '1.0', 'handler');

        // Advance time by 3 minutes (less than TTL)
        currentTime += 3 * 60 * 1000;

        // Add second entry
        isDuplicateEvent('C2', '2.0', 'handler');
        expect(getDedupCacheSize()).toBe(2);

        // Advance time by 3 more minutes (first entry now expired, second still valid)
        currentTime += 3 * 60 * 1000;

        // Force cleanup
        forceCleanup();

        // Only the newer entry should remain
        expect(getDedupCacheSize()).toBe(1);

        // First entry should now be treated as new (was cleaned up)
        expect(isDuplicateEvent('C1', '1.0', 'handler')).toBe(false);

        // Second entry should still be duplicate
        expect(isDuplicateEvent('C2', '2.0', 'handler')).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });

    it('should accept optional traceId parameter', () => {
      // Just verify the function accepts traceId without error
      const result = isDuplicateEvent('C123', '1.0', 'handler', 'trace-123');
      expect(result).toBe(false);

      // Duplicate call with different traceId should still detect duplicate
      const result2 = isDuplicateEvent('C123', '1.0', 'handler', 'trace-456');
      expect(result2).toBe(true);
    });
  });
});

