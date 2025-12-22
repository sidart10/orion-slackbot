/**
 * Vercel KV Storage Adapter Tests
 *
 * @see Story 2.8 - Task 9: Implement Vercel KV Adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to create async iterable from array
function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        next: async () => {
          if (index < items.length) {
            return { value: items[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

// Mock @vercel/kv
const mockKV = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue([0, []]),
  scanIterator: vi.fn().mockReturnValue(createAsyncIterable([])),
  ping: vi.fn().mockResolvedValue('PONG'),
};

vi.mock('@vercel/kv', () => ({
  kv: mockKV,
}));

describe('memory/vercel-kv-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildKVKey', () => {
    it('should build key with orion prefix', async () => {
      const { buildKVKey } = await import('./vercel-kv-storage.js');
      const key = buildKVKey('preference', 'U123');
      expect(key).toBe('orion:preference:U123');
    });

    it('should build conversation key correctly', async () => {
      const { buildKVKey } = await import('./vercel-kv-storage.js');
      const key = buildKVKey('conversation', 'C456_1702848000.123');
      expect(key).toBe('orion:conversation:C456_1702848000.123');
    });

    it('should build knowledge key correctly', async () => {
      const { buildKVKey } = await import('./vercel-kv-storage.js');
      const key = buildKVKey('knowledge', 'audience-segments');
      expect(key).toBe('orion:knowledge:audience-segments');
    });
  });

  describe('parseKVKey', () => {
    it('should parse valid preference key', async () => {
      const { parseKVKey } = await import('./vercel-kv-storage.js');
      const parsed = parseKVKey('orion:preference:U123');

      expect(parsed).toEqual({ type: 'preference', key: 'U123' });
    });

    it('should parse valid conversation key', async () => {
      const { parseKVKey } = await import('./vercel-kv-storage.js');
      const parsed = parseKVKey('orion:conversation:C456_1702848000.123');

      expect(parsed).toEqual({ type: 'conversation', key: 'C456_1702848000.123' });
    });

    it('should return null for invalid key format', async () => {
      const { parseKVKey } = await import('./vercel-kv-storage.js');
      const parsed = parseKVKey('invalid:key');

      expect(parsed).toBeNull();
    });

    it('should return null for missing prefix', async () => {
      const { parseKVKey } = await import('./vercel-kv-storage.js');
      const parsed = parseKVKey('preference:U123');

      expect(parsed).toBeNull();
    });
  });

  describe('saveToKV', () => {
    it('should save data with correct key format', async () => {
      const { saveToKV } = await import('./vercel-kv-storage.js');

      await saveToKV('preference', 'U123', { theme: 'dark' });

      expect(mockKV.set).toHaveBeenCalledWith(
        'orion:preference:U123',
        expect.objectContaining({
          data: { theme: 'dark' },
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })
      );
    });

    it('should include metadata when provided', async () => {
      const { saveToKV } = await import('./vercel-kv-storage.js');

      await saveToKV('conversation', 'C123_ts', { summary: 'test' }, { userId: 'U456' });

      expect(mockKV.set).toHaveBeenCalledWith(
        'orion:conversation:C123_ts',
        expect.objectContaining({
          data: { summary: 'test' },
          metadata: { userId: 'U456' },
        })
      );
    });

    it('should preserve createdAt when updating existing record', async () => {
      const { saveToKV } = await import('./vercel-kv-storage.js');

      // Mock existing data with old createdAt
      mockKV.get.mockResolvedValueOnce({
        data: { old: 'data' },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      await saveToKV('preference', 'U123', { new: 'data' });

      expect(mockKV.set).toHaveBeenCalledWith(
        'orion:preference:U123',
        expect.objectContaining({
          createdAt: '2025-01-01T00:00:00.000Z', // Preserved
          data: { new: 'data' },
        })
      );
    });
  });

  describe('loadFromKV', () => {
    it('should load data by type and key', async () => {
      const { loadFromKV } = await import('./vercel-kv-storage.js');

      mockKV.get.mockResolvedValueOnce({
        data: { theme: 'dark' },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      const result = await loadFromKV('preference', 'U123');

      expect(mockKV.get).toHaveBeenCalledWith('orion:preference:U123');
      expect(result?.data).toEqual({ theme: 'dark' });
    });

    it('should return null when key not found', async () => {
      const { loadFromKV } = await import('./vercel-kv-storage.js');

      mockKV.get.mockResolvedValueOnce(null);

      const result = await loadFromKV('preference', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const { loadFromKV } = await import('./vercel-kv-storage.js');

      mockKV.get.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await loadFromKV('preference', 'U123');

      expect(result).toBeNull();
    });
  });

  describe('deleteFromKV', () => {
    it('should delete by type and key', async () => {
      const { deleteFromKV } = await import('./vercel-kv-storage.js');

      mockKV.del.mockResolvedValueOnce(1);

      const result = await deleteFromKV('preference', 'U123');

      expect(mockKV.del).toHaveBeenCalledWith('orion:preference:U123');
      expect(result).toBe(true);
    });

    it('should return false when key not found', async () => {
      const { deleteFromKV } = await import('./vercel-kv-storage.js');

      mockKV.del.mockResolvedValueOnce(0);

      const result = await deleteFromKV('preference', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('listKVKeys', () => {
    it('should list keys with type prefix', async () => {
      const { listKVKeys } = await import('./vercel-kv-storage.js');

      mockKV.scanIterator.mockReturnValueOnce(
        createAsyncIterable(['orion:preference:U123', 'orion:preference:U456'])
      );

      const keys = await listKVKeys('preference');

      expect(mockKV.scanIterator).toHaveBeenCalledWith({ match: 'orion:preference:*', count: 100 });
      expect(keys).toEqual(['U123', 'U456']);
    });

    it('should handle multiple keys from iterator', async () => {
      const { listKVKeys } = await import('./vercel-kv-storage.js');

      // scanIterator handles pagination internally, so we just return all items
      mockKV.scanIterator.mockReturnValueOnce(
        createAsyncIterable(['orion:conversation:C1_ts1', 'orion:conversation:C2_ts2'])
      );

      const keys = await listKVKeys('conversation');

      expect(mockKV.scanIterator).toHaveBeenCalledTimes(1);
      expect(keys).toEqual(['C1_ts1', 'C2_ts2']);
    });

    it('should filter with additional pattern', async () => {
      const { listKVKeys } = await import('./vercel-kv-storage.js');

      mockKV.scanIterator.mockReturnValueOnce(
        createAsyncIterable(['orion:conversation:C123_ts1'])
      );

      await listKVKeys('conversation', 'C123_');

      expect(mockKV.scanIterator).toHaveBeenCalledWith({ match: 'orion:conversation:C123_*', count: 100 });
    });
  });

  describe('isKVAvailable', () => {
    it('should return true when KV is accessible', async () => {
      const { isKVAvailable } = await import('./vercel-kv-storage.js');

      mockKV.ping.mockResolvedValueOnce('PONG');

      const result = await isKVAvailable();

      expect(result).toBe(true);
    });

    it('should return false when KV is not accessible', async () => {
      const { isKVAvailable } = await import('./vercel-kv-storage.js');

      mockKV.ping.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await isKVAvailable();

      expect(result).toBe(false);
    });
  });
});

