/**
 * Container Lifecycle Manager
 *
 * Manages container ID persistence across conversation turns.
 * Uses Map (not WeakMap) because threadTs keys are strings.
 *
 * @see Story 6.3 - Container Lifecycle Manager
 * @see src/tools/mcp/manager.ts for singleton pattern reference
 */

import { logger } from '../utils/logger.js';
import type { ContainerState } from './types.js';

const CONTAINER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Singleton instance */
let instance: ContainerLifecycleManager | null = null;

/**
 * Manages container ID persistence across conversation turns.
 *
 * Features:
 * - TTL-based expiration (30 minutes)
 * - Max entries enforcement (1000)
 * - Periodic cleanup of expired entries
 * - Graceful shutdown support
 *
 * @example
 * const containerId = containerLifecycle.getContainerId(threadTs);
 * if (!containerId) {
 *   // New thread, API will create fresh container
 * }
 * // After response with container.id
 * containerLifecycle.setContainerId(threadTs, response.container.id);
 */
class ContainerLifecycleManager {
  private containers = new Map<string, ContainerState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.cleanupTimer = setInterval(
      () => this.pruneExpired(),
      CLEANUP_INTERVAL_MS
    );
    // Prevent timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** Get the singleton instance. */
  static getInstance(): ContainerLifecycleManager {
    if (!instance) {
      instance = new ContainerLifecycleManager();
    }
    return instance;
  }

  /**
   * Get container ID if exists and not expired.
   * Updates lastUsed on hit (touch pattern).
   *
   * @param threadTs - Slack thread timestamp
   * @returns Container ID or undefined if not found/expired
   *
   * @see Story 6.3 AC#1 - Multi-turn container reuse
   * @see Story 6.3 AC#4 - TTL expiration
   */
  getContainerId(threadTs: string): string | undefined {
    const state = this.containers.get(threadTs);
    if (!state) return undefined;

    // Check TTL
    if (Date.now() - state.lastUsed > CONTAINER_TTL_MS) {
      this.containers.delete(threadTs);
      logger.debug({
        event: 'container.lifecycle.expired',
        threadTs,
        containerId: state.containerId,
      });
      return undefined;
    }

    // Update lastUsed (touch)
    state.lastUsed = Date.now();
    return state.containerId;
  }

  /**
   * Store container ID for thread.
   * Enforces max entries by pruning expired first, then oldest.
   *
   * @param threadTs - Slack thread timestamp
   * @param containerId - Container ID from API response
   *
   * @see Story 6.3 AC#3 - Container updates
   * @see Story 6.3 AC#6 - Memory bounds
   */
  setContainerId(threadTs: string, containerId: string): void {
    // Enforce max entries — prune oldest if at limit
    if (this.containers.size >= MAX_ENTRIES && !this.containers.has(threadTs)) {
      this.pruneExpired();
      // If still at limit, remove oldest
      if (this.containers.size >= MAX_ENTRIES) {
        const oldest = this.findOldest();
        if (oldest) {
          this.containers.delete(oldest);
          logger.debug({
            event: 'container.lifecycle.evicted',
            threadTs: oldest,
            reason: 'max_entries',
          });
        }
      }
    }

    this.containers.set(threadTs, {
      containerId,
      lastUsed: Date.now(),
    });
  }

  /**
   * Remove container ID for thread.
   *
   * @param threadTs - Slack thread timestamp
   */
  clearContainerId(threadTs: string): void {
    this.containers.delete(threadTs);
  }

  /**
   * Clear cleanup timer. Call on SIGTERM.
   *
   * @see Story 6.3 AC#7 - Graceful shutdown
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * For testing only — clear all entries and reset state.
   */
  _clear(): void {
    this.containers.clear();
  }

  /**
   * Remove all expired entries.
   */
  private pruneExpired(): void {
    const now = Date.now();
    let pruned = 0;
    for (const [threadTs, state] of this.containers) {
      if (now - state.lastUsed > CONTAINER_TTL_MS) {
        this.containers.delete(threadTs);
        pruned++;
      }
    }
    if (pruned > 0) {
      logger.debug({
        event: 'container.lifecycle.pruned',
        count: pruned,
        remaining: this.containers.size,
      });
    }
  }

  /**
   * Find the oldest entry by lastUsed timestamp.
   */
  private findOldest(): string | undefined {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [threadTs, state] of this.containers) {
      if (state.lastUsed < oldestTime) {
        oldestTime = state.lastUsed;
        oldest = threadTs;
      }
    }
    return oldest;
  }
}

export const containerLifecycle = ContainerLifecycleManager.getInstance();
