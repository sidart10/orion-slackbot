/**
 * Memory Response Formatting
 *
 * Formats memory tool responses per Anthropic SDK specification.
 * - File view: 6-char right-aligned line numbers with tab separator
 * - Directory view: size + path listing
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1 - view command response format
 */

/**
 * Format file content with 6-char right-aligned line numbers.
 *
 * @param content - File content to format
 * @param viewRange - Optional [start, end] line range (1-indexed)
 * @returns Formatted content with line numbers
 * @throws Error if view_range is invalid
 */
export function formatFileWithLineNumbers(
  content: string,
  viewRange?: [number, number]
): string {
  const lines = content.split('\n');

  // Validate view_range if provided
  if (viewRange) {
    const [start, end] = viewRange;
    if (start < 1) {
      throw new Error(`Invalid view_range: start must be >= 1, got ${start}`);
    }
    if (end < start) {
      throw new Error(`Invalid view_range: end (${end}) must be >= start (${start})`);
    }
    if (start > lines.length) {
      throw new Error(
        `Invalid view_range: start (${start}) exceeds file length (${lines.length})`
      );
    }
  }

  const [start, end] = viewRange ?? [1, lines.length];
  const actualEnd = Math.min(end, lines.length); // Clamp to file length

  return lines
    .slice(start - 1, actualEnd)
    .map((line, i) => {
      const lineNum = (start + i).toString().padStart(6, ' ');
      return `${lineNum}\t${line}`;
    })
    .join('\n');
}

/**
 * Format directory listing with sizes.
 *
 * @param files - Array of files with path and size
 * @returns Formatted directory listing
 */
export function formatDirectoryListing(
  files: Array<{ path: string; size: number }>
): string {
  if (files.length === 0) {
    return '(empty directory)';
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  };

  return files.map((f) => `${formatSize(f.size).padStart(6, ' ')}\t${f.path}`).join('\n');
}

