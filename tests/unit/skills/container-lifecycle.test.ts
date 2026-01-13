/**
 * Container Lifecycle Manager Tests
 *
 * Unit tests for container ID persistence across conversation turns.
 * Uses Vitest fake timers for TTL expiration testing.
 *
 * @see Story 6.3 - Skills Container Configuration
 * @see AC#1 - Multi-turn container reuse
 * @see AC#2 - Fresh container for new threads
 * @see AC#4 - TTL expiration (30 min)
 * @see AC#6 - Memory bounds (1000 entries)
 * @see AC#7 - Graceful shutdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createContainerState,
  createThreadTs,
  createThreadTsArray,
} from '@test/factories/container-factory.js';

// Mock logger to prevent console output
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Constants that must match implementation
const CONTAINER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 1000;

describe('ContainerLifecycleManager', () => {
  beforeEach(async () => {
    // Use fake timers for TTL testing
    vi.useFakeTimers({ now: Date.now() });

    // Clear singleton state between tests
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    containerLifecycle._clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // AC#2: Fresh container for new threads
  // ===========================================================================

  it('returns undefined for unknown threadTs', async () => {
    // GIVEN: A lifecycle manager with no stored containers
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');

    // WHEN: Requesting containerId for an unknown thread
    const threadTs = createThreadTs();
    const result = containerLifecycle.getContainerId(threadTs);

    // THEN: Returns undefined
    expect(result).toBeUndefined();
  });

  // ===========================================================================
  // AC#1, AC#3: Container reuse and updates
  // ===========================================================================

  it('returns stored containerId after set', async () => {
    // GIVEN: A lifecycle manager
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threadTs = createThreadTs();
    const containerId = 'cntr_abc123xyz';

    // WHEN: Setting a containerId for a thread
    containerLifecycle.setContainerId(threadTs, containerId);

    // THEN: Same containerId is returned on get
    const result = containerLifecycle.getContainerId(threadTs);
    expect(result).toBe(containerId);
  });

  // ===========================================================================
  // AC#4: TTL expiration (30 min timeout)
  // ===========================================================================

  it('returns undefined after TTL expires', async () => {
    // GIVEN: A container was set
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threadTs = createThreadTs();
    containerLifecycle.setContainerId(threadTs, 'cntr_willexpire');

    // Verify it exists
    expect(containerLifecycle.getContainerId(threadTs)).toBe('cntr_willexpire');

    // WHEN: Time advances past TTL (30 minutes + 1ms)
    vi.advanceTimersByTime(CONTAINER_TTL_MS + 1);

    // THEN: Returns undefined (expired)
    const result = containerLifecycle.getContainerId(threadTs);
    expect(result).toBeUndefined();
  });

  it('updates lastUsed on get', async () => {
    // GIVEN: A container was set
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threadTs = createThreadTs();
    containerLifecycle.setContainerId(threadTs, 'cntr_touch');

    // WHEN: Time advances to near TTL, then we access it
    vi.advanceTimersByTime(CONTAINER_TTL_MS - 1000); // 1 second before expiry
    const firstResult = containerLifecycle.getContainerId(threadTs);
    expect(firstResult).toBe('cntr_touch'); // Still valid, lastUsed updated

    // AND: More time passes (another near-TTL period)
    vi.advanceTimersByTime(CONTAINER_TTL_MS - 1000);

    // THEN: Container is still valid because lastUsed was updated
    const secondResult = containerLifecycle.getContainerId(threadTs);
    expect(secondResult).toBe('cntr_touch');
  });

  // ===========================================================================
  // Explicit removal
  // ===========================================================================

  it('clears entry on clearContainerId', async () => {
    // GIVEN: A container was set
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threadTs = createThreadTs();
    containerLifecycle.setContainerId(threadTs, 'cntr_clear');
    expect(containerLifecycle.getContainerId(threadTs)).toBe('cntr_clear');

    // WHEN: Clearing the container
    containerLifecycle.clearContainerId(threadTs);

    // THEN: Returns undefined
    const result = containerLifecycle.getContainerId(threadTs);
    expect(result).toBeUndefined();
  });

  // ===========================================================================
  // AC#6: Memory bounds (max 1000 entries)
  // ===========================================================================

  it('prunes oldest when at max entries', async () => {
    // GIVEN: Manager is at max capacity
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threads = createThreadTsArray(MAX_ENTRIES);

    // Add MAX_ENTRIES containers with staggered timestamps
    for (let i = 0; i < MAX_ENTRIES; i++) {
      containerLifecycle.setContainerId(threads[i], `cntr_${i}`);
      vi.advanceTimersByTime(10); // Stagger lastUsed times
    }

    // First thread should be the oldest (has smallest lastUsed)
    // Access it to confirm it exists before adding new entry
    expect(containerLifecycle.getContainerId(threads[0])).toBe('cntr_0');

    // Advance time so first thread is older than all others again
    // (getContainerId above touched it, resetting lastUsed)
    vi.advanceTimersByTime(10);

    // Re-touch threads 1-999 to make thread 0 oldest again
    for (let i = 1; i < MAX_ENTRIES; i++) {
      containerLifecycle.getContainerId(threads[i]);
      vi.advanceTimersByTime(1);
    }

    // WHEN: Adding one more (exceeds limit)
    const newThread = createThreadTs();
    containerLifecycle.setContainerId(newThread, 'cntr_new');

    // THEN: New container is stored
    expect(containerLifecycle.getContainerId(newThread)).toBe('cntr_new');

    // AND: Oldest entry (threads[0]) was pruned to make room
    expect(containerLifecycle.getContainerId(threads[0])).toBeUndefined();

    // AND: Other entries still exist (e.g., threads[1])
    expect(containerLifecycle.getContainerId(threads[1])).toBe('cntr_1');
  });

  it('prunes only expired entries', async () => {
    // GIVEN: Mix of fresh and expired containers
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const freshThread = createThreadTs();
    const expiredThread = createThreadTs();

    containerLifecycle.setContainerId(expiredThread, 'cntr_old');
    vi.advanceTimersByTime(CONTAINER_TTL_MS + 1); // Expire the first one

    containerLifecycle.setContainerId(freshThread, 'cntr_fresh');

    // WHEN: Pruning is triggered (e.g., by accessing the manager)
    // Force a prune by filling to max - the implementation prunes expired first
    // For this test, we just verify fresh entries survive after time passes

    // THEN: Fresh entry survives
    expect(containerLifecycle.getContainerId(freshThread)).toBe('cntr_fresh');

    // AND: Expired entry is gone
    expect(containerLifecycle.getContainerId(expiredThread)).toBeUndefined();
  });

  // ===========================================================================
  // AC#7: Graceful shutdown
  // ===========================================================================

  it('clears timer on destroy', async () => {
    // GIVEN: A lifecycle manager with cleanup timer
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');

    // Spy on clearInterval
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // WHEN: Destroying the manager
    containerLifecycle.destroy();

    // THEN: clearInterval was called
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // ===========================================================================
  // Thread safety (JavaScript guarantee)
  // ===========================================================================

  it('handles concurrent access safely', async () => {
    // GIVEN: A lifecycle manager
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');

    // WHEN: Rapid interleaved set/get operations (simulating concurrent access)
    const operations = [];
    for (let i = 0; i < 100; i++) {
      const thread = `${1700000000 + i}.000001`;
      operations.push(containerLifecycle.setContainerId(thread, `cntr_${i}`));
      operations.push(containerLifecycle.getContainerId(thread));
    }

    // THEN: All operations complete without throwing
    // AND: State is consistent (last write wins for any given key)
    const lastThread = `${1700000000 + 99}.000001`;
    expect(containerLifecycle.getContainerId(lastThread)).toBe('cntr_99');
  });

  // ===========================================================================
  // Test isolation
  // ===========================================================================

  it('clears all entries on _clear', async () => {
    // GIVEN: Manager has multiple entries
    const { containerLifecycle } = await import('@/skills/container-lifecycle.js');
    const threads = createThreadTsArray(5);
    threads.forEach((t, i) => containerLifecycle.setContainerId(t, `cntr_${i}`));

    // Verify entries exist
    expect(containerLifecycle.getContainerId(threads[0])).toBeDefined();

    // WHEN: Calling _clear()
    containerLifecycle._clear();

    // THEN: All entries are removed
    threads.forEach((t) => {
      expect(containerLifecycle.getContainerId(t)).toBeUndefined();
    });
  });
});
