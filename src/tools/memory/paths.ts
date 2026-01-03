/**
 * Memory Path Builders & Validation
 *
 * Type-safe path construction for memory scopes using branded types.
 * Prevents raw strings from being used as memory paths.
 *
 * @see Story 5.2 - Memory Scopes & Path Builders
 * @see FR45 - Memory in three scopes: global, user-level, session-level
 * @see architecture.md - MemoryPath branded type (object pattern)
 */

import * as path from 'path';

// =============================================================================
// Constants
// =============================================================================

/** Max file size for memory files (100KB) */
export const MAX_MEMORY_FILE_SIZE = 100 * 1024;

/** Allowed file extensions for memory files */
export const ALLOWED_EXTENSIONS = ['.json', '.md', '.txt', '.yaml'] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

// =============================================================================
// Branded Type
// =============================================================================

/**
 * Branded type for memory paths — object pattern per architecture.md
 *
 * Prevents raw strings from being used as memory paths.
 * All paths must be created via Memory.* builders.
 *
 * @see architecture.md - Implementation Patterns
 */
export type MemoryPath = {
  readonly __brand: 'MemoryPath';
  readonly path: string;
};

/**
 * Create a branded MemoryPath from a validated path string.
 * Internal use only — external code should use Memory.* builders.
 */
function createMemoryPath(pathStr: string): MemoryPath {
  return Object.freeze({ __brand: 'MemoryPath' as const, path: pathStr });
}

/**
 * Extract raw path string from MemoryPath.
 */
export function getPath(memoryPath: MemoryPath): string {
  return memoryPath.path;
}

// =============================================================================
// Validation Functions (Internal)
// =============================================================================

/**
 * Validate a file name for memory storage.
 * @throws Error if invalid
 */
function validateFileName(file: string): void {
  if (!file) {
    throw new Error('File name required');
  }
  if (file.includes('/') || file.includes('..')) {
    throw new Error(`Invalid file name: ${file}`);
  }

  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new Error(`Invalid extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
}

/**
 * Validate a Slack user ID.
 * @throws Error if invalid
 */
function validateUserId(userId: string): void {
  // Slack user IDs start with U or W (Enterprise Grid)
  if (!userId || !/^[UW][A-Z0-9]+$/.test(userId)) {
    throw new Error(`Invalid Slack user ID: ${userId}`);
  }
}

/**
 * Validate a Slack thread timestamp.
 * @throws Error if invalid
 */
function validateThreadTs(threadTs: string): void {
  // Slack timestamps: 1234567890.123456
  if (!threadTs || !/^\d+\.\d+$/.test(threadTs)) {
    throw new Error(`Invalid thread timestamp: ${threadTs}`);
  }
}

/**
 * Sanitize thread_ts for GCS paths (replace . with -).
 */
function sanitizeThreadTs(threadTs: string): string {
  return threadTs.replace('.', '-');
}

// =============================================================================
// Path Builders
// =============================================================================

/**
 * Memory path builders — type-safe construction
 *
 * Three scopes:
 * - global: Shared learnings across all users
 * - user: Per-user preferences and history
 * - session: Per-thread conversation context
 *
 * @see FR45 - Memory in three scopes
 */
export const Memory = {
  /**
   * Global memory scope — shared across all users.
   * @param file - File name with extension (e.g., 'learnings.md')
   */
  global: (file: string): MemoryPath => {
    validateFileName(file);
    return createMemoryPath(`/memories/global/${file}`);
  },

  /**
   * User memory scope — per Slack user.
   * @param userId - Slack user ID (e.g., 'U12345ABC')
   * @param file - File name with extension
   */
  user: (userId: string, file: string): MemoryPath => {
    validateUserId(userId);
    validateFileName(file);
    return createMemoryPath(`/memories/users/${userId}/${file}`);
  },

  /**
   * Session memory scope — per Slack thread.
   * @param threadTs - Slack thread timestamp (e.g., '1234567890.123456')
   * @param file - File name with extension
   */
  session: (threadTs: string, file: string): MemoryPath => {
    validateThreadTs(threadTs);
    validateFileName(file);
    const sanitizedTs = sanitizeThreadTs(threadTs);
    return createMemoryPath(`/memories/sessions/${sanitizedTs}/${file}`);
  },

  /** List directory paths */
  list: {
    /** List all global memories */
    global: (): MemoryPath => createMemoryPath('/memories/global/'),

    /** List memories for a specific user */
    user: (userId: string): MemoryPath => {
      validateUserId(userId);
      return createMemoryPath(`/memories/users/${userId}/`);
    },

    /** List memories for a specific session/thread */
    session: (threadTs: string): MemoryPath => {
      validateThreadTs(threadTs);
      const sanitizedTs = sanitizeThreadTs(threadTs);
      return createMemoryPath(`/memories/sessions/${sanitizedTs}/`);
    },

    /** List all memory scopes */
    all: (): MemoryPath => createMemoryPath('/memories/'),
  },
} as const;

// =============================================================================
// Path Validation (for External Input)
// =============================================================================

export interface PathValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a memory path from external input (e.g., Claude tool call).
 *
 * For paths from Claude, not from our code.
 * Internal code should use Memory.* builders.
 */
export function validateMemoryPath(rawPath: string): PathValidation {
  if (!rawPath.startsWith('/memories/') && rawPath !== '/memories') {
    return { valid: false, error: 'Path must start with /memories/' };
  }

  if (rawPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  if (!/^[a-zA-Z0-9/_.-]+$/.test(rawPath)) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  // Must be within a valid scope (unless root listing)
  const validScopes = ['/memories/global/', '/memories/users/', '/memories/sessions/'];
  const isValidScope = validScopes.some((scope) => rawPath.startsWith(scope));

  if (!isValidScope && rawPath !== '/memories/' && rawPath !== '/memories') {
    return { valid: false, error: 'Path must be within global/, users/, or sessions/ scope' };
  }

  // Validate extension if it's a file (not directory)
  if (!rawPath.endsWith('/')) {
    const ext = path.extname(rawPath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
      return { valid: false, error: `Invalid extension: ${ext}` };
    }
  }

  return { valid: true };
}

