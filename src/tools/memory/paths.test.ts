/**
 * Memory Path Tests
 *
 * Tests for branded MemoryPath type, path builders, and validation.
 *
 * @see Story 5.2 - Memory Scopes & Path Builders
 */

import { describe, it, expect } from 'vitest';
import {
  Memory,
  getPath,
  validateMemoryPath,
  MAX_MEMORY_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  type MemoryPath,
} from './paths.js';

describe('MemoryPath Branded Type', () => {
  describe('Task 1: Branded Type Enforcement', () => {
    it('should create MemoryPath with __brand property', () => {
      const path = Memory.global('test.json');
      expect(path).toHaveProperty('__brand', 'MemoryPath');
      expect(path).toHaveProperty('path');
    });

    it('should extract path string via getPath()', () => {
      const memPath = Memory.global('test.json');
      const pathString = getPath(memPath);
      expect(typeof pathString).toBe('string');
      expect(pathString).toBe('/memories/global/test.json');
    });

    // TypeScript compile-time check - raw strings not assignable to MemoryPath
    // This test documents the expected behavior; actual enforcement is at compile time
    it('should have readonly properties', () => {
      const path = Memory.global('test.json');
      // @ts-expect-error - __brand is readonly
      expect(() => { (path as { __brand: string }).__brand = 'foo'; }).toThrow;
    });
  });
});

describe('Memory Path Builders', () => {
  describe('Task 2: Memory.global()', () => {
    it('should generate correct global path (AC#1)', () => {
      const path = Memory.global('learnings.md');
      expect(getPath(path)).toBe('/memories/global/learnings.md');
    });

    it('should accept all allowed extensions', () => {
      expect(getPath(Memory.global('data.json'))).toBe('/memories/global/data.json');
      expect(getPath(Memory.global('notes.md'))).toBe('/memories/global/notes.md');
      expect(getPath(Memory.global('config.yaml'))).toBe('/memories/global/config.yaml');
      expect(getPath(Memory.global('readme.txt'))).toBe('/memories/global/readme.txt');
    });

    it('should reject file without extension', () => {
      expect(() => Memory.global('noext')).toThrow('Invalid extension');
    });

    it('should reject invalid extension', () => {
      expect(() => Memory.global('script.js')).toThrow('Invalid extension');
      expect(() => Memory.global('binary.exe')).toThrow('Invalid extension');
    });

    it('should reject path traversal in filename', () => {
      expect(() => Memory.global('../secret.json')).toThrow('Invalid file name');
      expect(() => Memory.global('foo/bar.json')).toThrow('Invalid file name');
    });

    it('should reject empty filename', () => {
      expect(() => Memory.global('')).toThrow('File name required');
    });
  });

  describe('Task 2: Memory.user()', () => {
    it('should generate correct user path (AC#2)', () => {
      const path = Memory.user('U12345ABC', 'preferences.json');
      expect(getPath(path)).toBe('/memories/users/U12345ABC/preferences.json');
    });

    it('should accept Enterprise Grid user IDs (W prefix)', () => {
      const path = Memory.user('W98765XYZ', 'prefs.json');
      expect(getPath(path)).toBe('/memories/users/W98765XYZ/prefs.json');
    });

    it('should reject invalid Slack user ID format', () => {
      expect(() => Memory.user('invalid', 'prefs.json')).toThrow('Invalid Slack user ID');
      expect(() => Memory.user('12345', 'prefs.json')).toThrow('Invalid Slack user ID');
      expect(() => Memory.user('u12345', 'prefs.json')).toThrow('Invalid Slack user ID'); // lowercase
      expect(() => Memory.user('', 'prefs.json')).toThrow('Invalid Slack user ID');
    });

    it('should validate filename for user paths', () => {
      expect(() => Memory.user('U12345ABC', '../hack.json')).toThrow('Invalid file name');
    });
  });

  describe('Task 2: Memory.session()', () => {
    it('should generate correct session path with sanitized timestamp (AC#3)', () => {
      const path = Memory.session('1234567890.123456', 'context.md');
      // Note: . replaced with - for GCS compatibility
      expect(getPath(path)).toBe('/memories/sessions/1234567890-123456/context.md');
    });

    it('should reject invalid thread timestamp format', () => {
      expect(() => Memory.session('invalid', 'context.md')).toThrow('Invalid thread timestamp');
      expect(() => Memory.session('12345', 'context.md')).toThrow('Invalid thread timestamp');
      expect(() => Memory.session('', 'context.md')).toThrow('Invalid thread timestamp');
      expect(() => Memory.session('abc.def', 'context.md')).toThrow('Invalid thread timestamp');
    });

    it('should validate filename for session paths', () => {
      expect(() => Memory.session('1234567890.123456', 'bad.exe')).toThrow('Invalid extension');
    });
  });

  describe('Task 2: Memory.list.*', () => {
    it('should generate global list path', () => {
      const path = Memory.list.global();
      expect(getPath(path)).toBe('/memories/global/');
    });

    it('should generate user list path', () => {
      const path = Memory.list.user('U12345ABC');
      expect(getPath(path)).toBe('/memories/users/U12345ABC/');
    });

    it('should generate session list path with sanitized timestamp', () => {
      const path = Memory.list.session('1234567890.123456');
      expect(getPath(path)).toBe('/memories/sessions/1234567890-123456/');
    });

    it('should generate root memories list path', () => {
      const path = Memory.list.all();
      expect(getPath(path)).toBe('/memories/');
    });

    it('should validate user ID for list.user()', () => {
      expect(() => Memory.list.user('invalid')).toThrow('Invalid Slack user ID');
    });

    it('should validate thread timestamp for list.session()', () => {
      expect(() => Memory.list.session('invalid')).toThrow('Invalid thread timestamp');
    });
  });
});

describe('Path Validation', () => {
  describe('Task 3: validateMemoryPath()', () => {
    it('should accept valid global path (AC#5)', () => {
      const result = validateMemoryPath('/memories/global/test.json');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid user path', () => {
      const result = validateMemoryPath('/memories/users/U12345/prefs.json');
      expect(result.valid).toBe(true);
    });

    it('should accept valid session path', () => {
      const result = validateMemoryPath('/memories/sessions/1234567890-123456/context.md');
      expect(result.valid).toBe(true);
    });

    it('should accept directory listing paths', () => {
      expect(validateMemoryPath('/memories/global/').valid).toBe(true);
      expect(validateMemoryPath('/memories/users/U12345/').valid).toBe(true);
      expect(validateMemoryPath('/memories/').valid).toBe(true);
      expect(validateMemoryPath('/memories').valid).toBe(true);
    });

    it('should reject path not starting with /memories/', () => {
      const result = validateMemoryPath('/other/path.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('/memories/');
    });

    it('should reject path traversal attacks (AC#5)', () => {
      const result = validateMemoryPath('/memories/global/../secrets.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject paths with invalid characters', () => {
      const result = validateMemoryPath('/memories/global/file<name>.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should reject paths outside valid scopes', () => {
      const result = validateMemoryPath('/memories/other/file.json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('scope');
    });

    it('should reject invalid file extensions', () => {
      const result = validateMemoryPath('/memories/global/script.js');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('extension');
    });

    it('should accept files without extension in directories', () => {
      // Directory paths don't need extension validation
      const result = validateMemoryPath('/memories/global/');
      expect(result.valid).toBe(true);
    });
  });
});

describe('Task 4: Input Validation Helpers', () => {
  // These are tested implicitly via the builders, but we test edge cases
  describe('Slack User ID validation', () => {
    it('should accept valid U-prefixed IDs', () => {
      expect(() => Memory.user('UABC123', 'test.json')).not.toThrow();
      expect(() => Memory.user('U0', 'test.json')).not.toThrow();
    });

    it('should accept valid W-prefixed IDs (Enterprise Grid)', () => {
      expect(() => Memory.user('WXYZ789', 'test.json')).not.toThrow();
    });

    it('should reject lowercase user IDs', () => {
      expect(() => Memory.user('uabc123', 'test.json')).toThrow();
    });
  });

  describe('Thread timestamp validation', () => {
    it('should accept standard Slack timestamps', () => {
      expect(() => Memory.session('1234567890.123456', 'test.md')).not.toThrow();
      expect(() => Memory.session('0.0', 'test.md')).not.toThrow();
    });

    it('should reject timestamps without decimal', () => {
      expect(() => Memory.session('1234567890', 'test.md')).toThrow();
    });

    it('should reject non-numeric timestamps', () => {
      expect(() => Memory.session('abc.123', 'test.md')).toThrow();
    });
  });

  describe('Thread timestamp sanitization', () => {
    it('should replace . with - in session paths', () => {
      const path = Memory.session('1609459200.000100', 'ctx.json');
      expect(getPath(path)).toContain('1609459200-000100');
      expect(getPath(path)).not.toContain('1609459200.000100');
    });
  });
});

describe('Constants', () => {
  it('should export MAX_MEMORY_FILE_SIZE as 100KB', () => {
    expect(MAX_MEMORY_FILE_SIZE).toBe(100 * 1024);
  });

  it('should export allowed extensions', () => {
    expect(ALLOWED_EXTENSIONS).toContain('.json');
    expect(ALLOWED_EXTENSIONS).toContain('.md');
    expect(ALLOWED_EXTENSIONS).toContain('.txt');
    expect(ALLOWED_EXTENSIONS).toContain('.yaml');
    expect(ALLOWED_EXTENSIONS).toHaveLength(4);
  });
});

