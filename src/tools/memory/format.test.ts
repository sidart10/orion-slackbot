/**
 * Memory Response Formatting Tests
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1 - view command response format
 */

import { describe, it, expect } from 'vitest';
import { formatFileWithLineNumbers, formatDirectoryListing } from './format.js';

describe('formatFileWithLineNumbers', () => {
  it('formats with 6-char right-aligned line numbers', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = formatFileWithLineNumbers(content);

    expect(result).toBe('     1\tline 1\n     2\tline 2\n     3\tline 3');
  });

  it('uses tab separator between number and content', () => {
    const content = 'hello';
    const result = formatFileWithLineNumbers(content);

    expect(result).toContain('\t');
    expect(result.split('\t').length).toBe(2);
  });

  it('handles view_range subset correctly', () => {
    const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
    const result = formatFileWithLineNumbers(content, [2, 4]);

    expect(result).toBe('     2\tline 2\n     3\tline 3\n     4\tline 4');
  });

  it('throws on start < 1', () => {
    const content = 'line 1\nline 2';

    expect(() => formatFileWithLineNumbers(content, [0, 2])).toThrow(
      'Invalid view_range: start must be >= 1'
    );
  });

  it('throws on end < start', () => {
    const content = 'line 1\nline 2\nline 3';

    expect(() => formatFileWithLineNumbers(content, [3, 1])).toThrow(
      'Invalid view_range: end (1) must be >= start (3)'
    );
  });

  it('throws on start > file length', () => {
    const content = 'line 1\nline 2';

    expect(() => formatFileWithLineNumbers(content, [5, 10])).toThrow(
      'Invalid view_range: start (5) exceeds file length (2)'
    );
  });

  it('clamps end to file length if exceeds', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = formatFileWithLineNumbers(content, [2, 100]);

    expect(result).toBe('     2\tline 2\n     3\tline 3');
  });

  it('handles empty file', () => {
    const content = '';
    const result = formatFileWithLineNumbers(content);

    expect(result).toBe('     1\t');
  });

  it('handles single line file', () => {
    const content = 'only line';
    const result = formatFileWithLineNumbers(content);

    expect(result).toBe('     1\tonly line');
  });

  it('handles large line numbers correctly', () => {
    // Create 1000 lines
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`);
    const content = lines.join('\n');
    const result = formatFileWithLineNumbers(content, [998, 1000]);

    expect(result).toBe('   998\tline 998\n   999\tline 999\n  1000\tline 1000');
  });
});

describe('formatDirectoryListing', () => {
  it('formats bytes as B for <1KB', () => {
    const files = [{ path: '/memories/small.txt', size: 512 }];
    const result = formatDirectoryListing(files);

    expect(result).toBe('  512B\t/memories/small.txt');
  });

  it('formats as K for 1KB-1MB', () => {
    const files = [{ path: '/memories/medium.txt', size: 5120 }]; // 5KB
    const result = formatDirectoryListing(files);

    expect(result).toBe('  5.0K\t/memories/medium.txt');
  });

  it('formats as M for >1MB', () => {
    const files = [{ path: '/memories/large.txt', size: 2 * 1024 * 1024 }]; // 2MB
    const result = formatDirectoryListing(files);

    expect(result).toBe('  2.0M\t/memories/large.txt');
  });

  it('right-aligns size to 6 chars', () => {
    const files = [{ path: '/memories/test.txt', size: 42 }];
    const result = formatDirectoryListing(files);

    // Size field should be 6 chars: "   42B"
    expect(result.substring(0, 6)).toBe('   42B');
  });

  it('uses tab separator', () => {
    const files = [{ path: '/memories/test.txt', size: 100 }];
    const result = formatDirectoryListing(files);

    expect(result).toContain('\t');
  });

  it('handles empty directory', () => {
    const result = formatDirectoryListing([]);

    expect(result).toBe('(empty directory)');
  });

  it('handles multiple files', () => {
    const files = [
      { path: '/memories/a.txt', size: 100 },
      { path: '/memories/b.txt', size: 2048 },
      { path: '/memories/c.txt', size: 3 * 1024 * 1024 },
    ];
    const result = formatDirectoryListing(files);

    const lines = result.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('100B');
    expect(lines[1]).toContain('2.0K');
    expect(lines[2]).toContain('3.0M');
  });
});

