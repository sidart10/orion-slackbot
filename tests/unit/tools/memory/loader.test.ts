/**
 * Memory Loader Tests
 *
 * @see Story 5.3 - Memory Auto-Check at Conversation Start
 * @see AC#1 - User starts thread → memories loaded into context
 * @see AC#2 - Returning user → stored preferences known
 * @see AC#3 - Thread resumed → session memory restored
 * @see AC#4 - Global learnings → available in any conversation
 * @see AC#5 - NFR: Loading within 2 seconds
 * @see AC#6 - Graceful fallback when no memories
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadRelevantMemories,
  formatMemoriesForContext,
  type MemoryContext,
  type LoadedMemories,
} from '@/tools/memory/loader.js';
import * as storage from '@/tools/memory/storage.js';

vi.mock('@/tools/memory/storage.js');
vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    span: vi.fn(() => ({ end: vi.fn() })),
    trace: vi.fn(() => ({ generation: vi.fn() })),
  })),
}));

describe('loadRelevantMemories', () => {
  const mockContext: MemoryContext = {
    userId: 'U12345ABC',
    threadTs: '1234567890.123456',
    traceId: 'trace-123',
    bucket: 'test-bucket',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads global, user, and session memories in parallel (AC#1, #2, #3, #4)', async () => {
    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      if (path.includes('global')) return 'Global context content';
      if (path.includes('users')) return '{"timezone": "America/New_York"}';
      if (path.includes('sessions')) return 'Session context content';
      throw new Error(`Unknown path: ${path}`);
    });

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.global).toBe('Global context content');
    expect(result.user).toBe('{"timezone": "America/New_York"}');
    expect(result.session).toBe('Session context content');
    expect(result.scopesFound).toContain('global');
    expect(result.scopesFound).toContain('user');
    expect(result.scopesFound).toContain('session');
  });

  it('returns partial results when some scopes are missing (AC#6)', async () => {
    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      if (path.includes('global')) return 'Global content';
      throw new Error('File not found');
    });

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.global).toBe('Global content');
    expect(result.user).toBeUndefined();
    expect(result.session).toBeUndefined();
    expect(result.scopesFound).toEqual(['global']);
  });

  it('returns empty result when all scopes fail (AC#6)', async () => {
    vi.mocked(storage.readFile).mockRejectedValue(new Error('File not found'));

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.scopesFound).toEqual([]);
    expect(result.global).toBeUndefined();
    expect(result.user).toBeUndefined();
    expect(result.session).toBeUndefined();
    expect(result.loadDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('skips user scope when userId not provided', async () => {
    const contextWithoutUser: MemoryContext = {
      threadTs: '1234567890.123456',
      traceId: 'trace-123',
      bucket: 'test-bucket',
    };

    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      if (path.includes('global')) return 'Global content';
      if (path.includes('sessions')) return 'Session content';
      throw new Error('File not found');
    });

    const resultPromise = loadRelevantMemories(contextWithoutUser);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.global).toBe('Global content');
    expect(result.session).toBe('Session content');
    expect(result.user).toBeUndefined();
    expect(result.scopesFound).toEqual(['global', 'session']);
    // Should NOT have called with users path
    expect(vi.mocked(storage.readFile)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('users')
    );
  });

  it('skips session scope when threadTs not provided', async () => {
    const contextWithoutThread: MemoryContext = {
      userId: 'U12345ABC',
      traceId: 'trace-123',
      bucket: 'test-bucket',
    };

    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      if (path.includes('global')) return 'Global content';
      if (path.includes('users')) return '{"pref": "value"}';
      throw new Error('File not found');
    });

    const resultPromise = loadRelevantMemories(contextWithoutThread);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.global).toBe('Global content');
    expect(result.user).toBe('{"pref": "value"}');
    expect(result.session).toBeUndefined();
    expect(result.scopesFound).toEqual(['global', 'user']);
  });

  it('tracks load duration in result', async () => {
    vi.mocked(storage.readFile).mockResolvedValue('content');

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;

    expect(result.loadDurationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.loadDurationMs).toBe('number');
  });

  it('sanitizes threadTs for GCS path (replaces . with -)', async () => {
    vi.mocked(storage.readFile).mockResolvedValue('content');

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(vi.mocked(storage.readFile)).toHaveBeenCalledWith(
      'test-bucket',
      expect.stringContaining('1234567890-123456')
    );
  });

  it('returns partial results on timeout (AC#5 - 2s NFR)', async () => {
    // Simulate a slow read that exceeds the 2s timeout
    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      if (path.includes('global')) {
        // Simulate slow global read
        return new Promise((resolve) => {
          setTimeout(() => resolve('Global content'), 3000);
        });
      }
      throw new Error('Not found');
    });

    const resultPromise = loadRelevantMemories(mockContext);

    // Advance past the 2s timeout
    await vi.advanceTimersByTimeAsync(2100);
    const result = await resultPromise;

    // Should return empty due to timeout
    expect(result.scopesFound).toEqual([]);
    expect(result.loadDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('completes successfully when all reads finish before timeout (AC#5)', async () => {
    vi.mocked(storage.readFile).mockImplementation(async (_bucket, path) => {
      // Fast reads - well under 2s
      if (path.includes('global')) return 'Global';
      if (path.includes('users')) return '{"pref": "value"}';
      if (path.includes('sessions')) return 'Session';
      throw new Error('Unknown');
    });

    const resultPromise = loadRelevantMemories(mockContext);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.scopesFound).toContain('global');
    expect(result.scopesFound).toContain('user');
    expect(result.scopesFound).toContain('session');
  });
});

describe('formatMemoriesForContext', () => {
  it('formats all scopes as markdown sections', () => {
    const memories: LoadedMemories = {
      global: 'Global learnings here',
      user: '{"timezone": "UTC", "language": "en"}',
      session: 'Previous conversation context',
      loadDurationMs: 100,
      scopesFound: ['global', 'user', 'session'],
    };

    const formatted = formatMemoriesForContext(memories);

    expect(formatted).toContain('# Restored Memory');
    expect(formatted).toContain('## Global Context');
    expect(formatted).toContain('Global learnings here');
    expect(formatted).toContain('## User Preferences');
    expect(formatted).toContain('timezone');
    expect(formatted).toContain('## Session Context');
    expect(formatted).toContain('Previous conversation context');
  });

  it('parses JSON user preferences into readable format', () => {
    const memories: LoadedMemories = {
      user: '{"timezone": "America/New_York", "language": "en"}',
      loadDurationMs: 50,
      scopesFound: ['user'],
    };

    const formatted = formatMemoriesForContext(memories);

    expect(formatted).toContain('- *timezone*: America/New_York');
    expect(formatted).toContain('- *language*: en');
  });

  it('falls back to raw content when user prefs are not JSON', () => {
    const memories: LoadedMemories = {
      user: 'Plain text preferences',
      loadDurationMs: 50,
      scopesFound: ['user'],
    };

    const formatted = formatMemoriesForContext(memories);

    expect(formatted).toContain('## User Context');
    expect(formatted).toContain('Plain text preferences');
  });

  it('returns empty string when no memories loaded', () => {
    const memories: LoadedMemories = {
      loadDurationMs: 50,
      scopesFound: [],
    };

    const formatted = formatMemoriesForContext(memories);

    expect(formatted).toBe('');
  });

  it('handles partial memories (only global)', () => {
    const memories: LoadedMemories = {
      global: 'Only global context',
      loadDurationMs: 30,
      scopesFound: ['global'],
    };

    const formatted = formatMemoriesForContext(memories);

    expect(formatted).toContain('## Global Context');
    expect(formatted).toContain('Only global context');
    expect(formatted).not.toContain('## User');
    expect(formatted).not.toContain('## Session');
  });
});

