import { describe, it, expect } from 'vitest';
import type { ToolErrorCode } from '@/utils/tool-result.js';
import { isRetryable } from '@/utils/tool-result.js';

// Type-level regression guard: if ToolErrorCode changes, this will fail to compile.
const _allToolErrorCodes: ToolErrorCode[] = [
  'TOOL_NOT_IMPLEMENTED',
  'TOOL_INVALID_INPUT',
  'TOOL_UNAVAILABLE',
  'TOOL_EXECUTION_FAILED',
  'TOOL_TIMEOUT',
  'RATE_LIMITED',
  'MCP_CONNECTION_FAILED',
  'TOOL_NOT_FOUND',
  'MEMORY_NOT_FOUND',
  'MEMORY_WRITE_FAILED',
  'SKILL_NOT_GKE', // Story 6.12: Skill should use PTC, not GKE
];

describe('tool-result', () => {
  describe('isRetryable', () => {
    it('should return true for common retryable error messages', () => {
      expect(isRetryable(new Error('429 rate limit'))).toBe(true);
      expect(isRetryable(new Error('timeout while calling API'))).toBe(true);
      expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    });

    it('should return false for non-Error values and non-retryable errors', () => {
      expect(isRetryable('nope')).toBe(false);
      expect(isRetryable(new Error('invalid request'))).toBe(false);
    });
  });
});


