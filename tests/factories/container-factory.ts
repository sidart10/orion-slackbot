/**
 * Container State Test Factory
 *
 * Factory functions for generating test data for container lifecycle tests.
 *
 * @see Story 6.3 - Skills Container Configuration
 */

import type { ContainerState } from '../../src/skills/types.js';

/**
 * Generate a realistic Slack thread_ts format.
 * Format: Unix epoch seconds.microseconds (e.g., "1704672000.123456")
 */
export function createThreadTs(): string {
  const seconds = Math.floor(Date.now() / 1000);
  const microseconds = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `${seconds}.${microseconds}`;
}

/**
 * Create a ContainerState with optional overrides.
 *
 * @param overrides - Partial ContainerState to merge
 * @returns Complete ContainerState
 *
 * @example
 * const state = createContainerState({ containerId: 'cntr_test123' });
 */
export function createContainerState(
  overrides: Partial<ContainerState> = {}
): ContainerState {
  return {
    containerId: `cntr_${Math.random().toString(36).substring(2, 15)}`,
    lastUsed: Date.now(),
    ...overrides,
  };
}

/**
 * Create multiple unique thread timestamps.
 *
 * @param count - Number of thread timestamps to generate
 * @returns Array of unique thread_ts strings
 */
export function createThreadTsArray(count: number): string[] {
  const timestamps = new Set<string>();
  while (timestamps.size < count) {
    timestamps.add(createThreadTs());
  }
  return Array.from(timestamps);
}
