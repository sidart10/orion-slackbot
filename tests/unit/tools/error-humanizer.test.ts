/**
 * Unit tests for Error Humanizer Module.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#6 - Test coverage for filtering
 */

import { describe, it, expect } from 'vitest';
import {
  humanizeError,
  extractPythonErrorType,
  isRetryableError,
} from '@/tools/error-humanizer.js';

describe('error-humanizer', () => {
  describe('extractPythonErrorType', () => {
    it('should extract error type from simple error line', () => {
      expect(extractPythonErrorType('ValueError: Invalid data')).toBe('ValueError');
      expect(extractPythonErrorType('TypeError: expected str')).toBe('TypeError');
      expect(extractPythonErrorType('ModuleNotFoundError: No module named pandas')).toBe('ModuleNotFoundError');
    });

    it('should extract error type from full stack trace', () => {
      const stackTrace = `Traceback (most recent call last):
  File "/app/script.py", line 42, in main
    result = process_data(data)
  File "/app/utils.py", line 15, in process_data
    return data.transform()
ValueError: Invalid data format`;
      expect(extractPythonErrorType(stackTrace)).toBe('ValueError');
    });

    it('should extract module-prefixed error types', () => {
      expect(extractPythonErrorType('json.JSONDecodeError: Expecting value')).toBe('json.JSONDecodeError');
    });

    it('should return null for non-error text', () => {
      expect(extractPythonErrorType('Hello world')).toBe(null);
      expect(extractPythonErrorType('Processing complete')).toBe(null);
    });

    it('should handle empty input', () => {
      expect(extractPythonErrorType('')).toBe(null);
    });
  });

  describe('humanizeError', () => {
    describe('with string errors', () => {
      it('should humanize ModuleNotFoundError', () => {
        const result = humanizeError("ModuleNotFoundError: No module named 'pandas'");
        expect(result.errorType).toBe('ModuleNotFoundError');
        expect(result.userMessage).toContain("capability that isn't available");
        expect(result.technicalDetails).toContain('pandas');
      });

      it('should humanize TimeoutError', () => {
        const result = humanizeError('TimeoutError: operation timed out');
        expect(result.errorType).toBe('TimeoutError');
        expect(result.userMessage).toContain('took too long');
      });

      it('should humanize PermissionError', () => {
        const result = humanizeError('PermissionError: access denied');
        expect(result.errorType).toBe('PermissionError');
        expect(result.userMessage).toContain("don't have access");
      });

      it('should humanize ConnectionError', () => {
        const result = humanizeError('ConnectionError: failed to connect');
        expect(result.errorType).toBe('ConnectionError');
        expect(result.userMessage).toContain("Couldn't connect");
      });

      it('should humanize ValueError', () => {
        const result = humanizeError('ValueError: invalid input');
        expect(result.errorType).toBe('ValueError');
        expect(result.userMessage).toContain('data format');
      });

      it('should humanize FileNotFoundError', () => {
        const result = humanizeError('FileNotFoundError: file.txt not found');
        expect(result.errorType).toBe('FileNotFoundError');
        expect(result.userMessage).toContain("couldn't be found");
      });

      it('should handle full Python stack trace', () => {
        const stackTrace = `Traceback (most recent call last):
  File "/app/main.py", line 10, in main
    import_data()
MemoryError: unable to allocate array`;
        const result = humanizeError(stackTrace);
        expect(result.errorType).toBe('MemoryError');
        expect(result.userMessage).toContain('too many resources');
        expect(result.technicalDetails).toContain('Traceback');
      });

      it('should fallback for unknown errors', () => {
        const result = humanizeError('SomeWeirdError: weird thing happened');
        expect(result.userMessage).toContain("Something went wrong");
      });
    });

    describe('with Error objects', () => {
      it('should humanize Error with code property', () => {
        const error = new Error('Connection refused') as Error & { code: string };
        error.code = 'ECONNREFUSED';
        const result = humanizeError(error);
        expect(result.errorType).toBe('ECONNREFUSED');
        expect(result.userMessage).toContain("Couldn't connect");
      });

      it('should humanize TypeError', () => {
        const error = new TypeError('Cannot read property');
        const result = humanizeError(error);
        expect(result.errorType).toBe('TypeError');
        expect(result.userMessage).toContain('technical issue');
      });

      it('should extract error code from message', () => {
        const error = new Error('connect ETIMEDOUT 10.0.0.1:443');
        const result = humanizeError(error);
        expect(result.errorType).toBe('ETIMEDOUT');
        expect(result.userMessage).toContain('took too long');
      });

      it('should include stack trace in technicalDetails', () => {
        const error = new Error('Test error');
        const result = humanizeError(error);
        expect(result.technicalDetails).toContain('Error: Test error');
      });
    });

    describe('with null/undefined', () => {
      it('should handle null', () => {
        const result = humanizeError(null);
        expect(result.userMessage).toContain("Something went wrong");
        expect(result.errorType).toBe('Unknown');
      });

      it('should handle undefined', () => {
        const result = humanizeError(undefined);
        expect(result.userMessage).toContain("Something went wrong");
        expect(result.errorType).toBe('Unknown');
      });
    });

    describe('with empty/unknown values', () => {
      it('should handle empty string', () => {
        const result = humanizeError('');
        expect(result.userMessage).toContain("Something went wrong");
        expect(result.errorType).toBe('Unknown');
      });

      it('should handle object', () => {
        const result = humanizeError({ message: 'test' });
        expect(result.userMessage).toContain("Something went wrong");
      });

      it('should handle number', () => {
        const result = humanizeError(500);
        expect(result.userMessage).toContain("Something went wrong");
      });
    });

    describe('module-prefixed errors', () => {
      it('should handle json.JSONDecodeError', () => {
        const result = humanizeError('json.JSONDecodeError: Expecting value');
        expect(result.errorType).toBe('json.JSONDecodeError');
        expect(result.userMessage).toContain('reading the data');
      });

      it('should handle asyncio.TimeoutError', () => {
        const result = humanizeError('asyncio.TimeoutError');
        expect(result.userMessage).toContain('took too long');
      });
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable connection errors', () => {
      expect(isRetryableError('ConnectionError')).toBe(true);
      expect(isRetryableError('ConnectionRefusedError')).toBe(true);
      expect(isRetryableError('ConnectionResetError')).toBe(true);
      expect(isRetryableError('ECONNREFUSED')).toBe(true);
    });

    it('should identify retryable timeout errors', () => {
      expect(isRetryableError('TimeoutError')).toBe(true);
      expect(isRetryableError('asyncio.TimeoutError')).toBe(true);
      expect(isRetryableError('ETIMEDOUT')).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryableError('ValueError')).toBe(false);
      expect(isRetryableError('TypeError')).toBe(false);
      expect(isRetryableError('ModuleNotFoundError')).toBe(false);
      expect(isRetryableError('PermissionError')).toBe(false);
    });
  });
});
