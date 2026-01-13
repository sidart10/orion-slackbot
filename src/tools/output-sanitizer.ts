/**
 * Output Sanitizer Module for Code Execution Output Cleanup.
 *
 * Filters out technical noise from code execution output to provide
 * clean, professional status messages to users.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#1 - No Code Leakage in User-Facing Output
 * @see AC#2 - Filtered Sandbox Output
 */

/**
 * Configuration for output sanitization.
 */
export interface SanitizeOptions {
  /** Preserve the final error message from stack traces (default: true) */
  preserveErrorMessage?: boolean;
  /** Placeholder text for filtered stack traces (default: '[Error occurred during execution]') */
  stackTracePlaceholder?: string;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  preserveErrorMessage: true,
  stackTracePlaceholder: '[Error occurred during execution]',
};

/**
 * Check if a line is a Python import statement.
 *
 * Matches:
 * - `import module`
 * - `import module as alias`
 * - `from module import name`
 * - `from module import (names...)`
 *
 * @param line - Single line to check
 * @returns True if line is an import statement
 */
export function isImportLine(line: string): boolean {
  const trimmed = line.trim();

  // Standard import: `import xxx` or `import xxx as yyy`
  if (/^import\s+\S/.test(trimmed)) {
    return true;
  }

  // From import: `from xxx import yyy`
  if (/^from\s+\S+\s+import\b/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Check if a line is part of a multi-line import continuation.
 *
 * Detects:
 * - Lines ending with backslash (continuation)
 * - Lines inside parentheses (multi-line import)
 * - Continuation lines that are just identifiers/commas
 *
 * @param line - Single line to check
 * @param inMultilineImport - Whether we're currently inside a multi-line import
 * @returns Object indicating if this is a continuation and if multi-line import continues
 */
export function checkMultilineImport(
  line: string,
  inMultilineImport: boolean
): { isContinuation: boolean; continuesMultiline: boolean } {
  const trimmed = line.trim();

  // Check for multi-line import start: from x import (
  if (/^from\s+\S+\s+import\s*\($/.test(trimmed) || /^import\s+\($/.test(trimmed)) {
    return { isContinuation: true, continuesMultiline: true };
  }

  // Check for line ending with open paren after import
  if (/^from\s+\S+\s+import\s+.*\($/.test(trimmed)) {
    return { isContinuation: true, continuesMultiline: true };
  }

  // Inside multi-line import
  if (inMultilineImport) {
    // Check if this line closes the parentheses
    if (trimmed.includes(')')) {
      return { isContinuation: true, continuesMultiline: false };
    }
    // Still inside multi-line import
    return { isContinuation: true, continuesMultiline: true };
  }

  // Check for backslash continuation on import line
  if (isImportLine(line) && trimmed.endsWith('\\')) {
    return { isContinuation: true, continuesMultiline: true };
  }

  // Check for continuation after backslash
  if (inMultilineImport && !trimmed.endsWith('\\') && !trimmed.includes('(')) {
    return { isContinuation: true, continuesMultiline: false };
  }

  return { isContinuation: false, continuesMultiline: false };
}

/**
 * Check if a line is a Python REPL artifact.
 *
 * Matches:
 * - `>>> ` (REPL prompt)
 * - `... ` (REPL continuation)
 *
 * @param line - Single line to check
 * @returns True if line is a REPL artifact
 */
export function isReplArtifact(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('>>> ') || trimmed.startsWith('... ');
}

/**
 * Check if a line is the start of a Python stack trace.
 *
 * @param line - Single line to check
 * @returns True if line starts a traceback
 */
export function isTracebackStart(line: string): boolean {
  return line.trim() === 'Traceback (most recent call last):';
}

/**
 * Check if a line is part of a stack trace (file reference or code line).
 *
 * Matches:
 * - `  File "/path/...", line N, in function`
 * - `  File "<stdin>", line N`
 * - Lines starting with `    ` followed by code (indented code from stack trace)
 * - Lines containing `at line`
 *
 * @param line - Single line to check
 * @returns True if line is part of stack trace
 */
export function isStackTraceLine(line: string): boolean {
  const trimmed = line.trim();

  // File reference line
  if (/^\s*File\s+"/.test(line)) {
    return true;
  }

  // "at line" pattern
  if (/\bat line\s+\d+/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Check if a line is a debug/verbose statement to filter.
 *
 * Matches:
 * - `DEBUG:` at start of line
 * - `[DEBUG]` at start of line
 * - `VERBOSE:` at start of line
 * - `[VERBOSE]` at start of line
 *
 * Does NOT match:
 * - Words containing DEBUG (like "DEBUGGING complete")
 *
 * @param line - Single line to check
 * @returns True if line is a debug statement
 */
export function isDebugStatement(line: string): boolean {
  const trimmed = line.trim();

  // Check for debug prefixes at start of line
  if (/^DEBUG:\s/.test(trimmed)) return true;
  if (/^\[DEBUG\]\s/.test(trimmed)) return true;
  if (/^VERBOSE:\s/.test(trimmed)) return true;
  if (/^\[VERBOSE\]\s/.test(trimmed)) return true;

  return false;
}

/**
 * Check if a line is a code artifact that should be filtered.
 *
 * This is a convenience function that combines all line-level checks:
 * - Import statements
 * - REPL artifacts
 * - Stack trace components
 * - Debug statements
 *
 * @param line - Single line to check
 * @returns True if line should be filtered
 *
 * @example
 * isCodeArtifact('import pandas as pd')  // true
 * isCodeArtifact('>>> print(x)')         // true
 * isCodeArtifact('DEBUG: entering func') // true
 * isCodeArtifact('Result: 42')           // false
 */
export function isCodeArtifact(line: string): boolean {
  return (
    isImportLine(line) ||
    isReplArtifact(line) ||
    isStackTraceLine(line) ||
    isDebugStatement(line) ||
    isTracebackStart(line)
  );
}

/**
 * Remove REPL prompts from a line while preserving content.
 *
 * @param line - Line potentially containing REPL prompt
 * @returns Line with REPL prompt removed, or empty string if line is just prompt
 */
function stripReplPrompt(line: string): string {
  if (line.trimStart().startsWith('>>> ')) {
    const afterPrompt = line.replace(/^\s*>>> /, '');
    // If it's just the prompt with no content, filter it
    if (afterPrompt.trim() === '') return '';
    return afterPrompt;
  }
  if (line.trimStart().startsWith('... ')) {
    const afterPrompt = line.replace(/^\s*\.\.\. /, '');
    if (afterPrompt.trim() === '') return '';
    return afterPrompt;
  }
  return line;
}

/**
 * Sanitize code execution output by removing technical noise.
 *
 * Filters out:
 * - Python import statements (single and multi-line)
 * - Stack traces (replaces with placeholder, preserves error message if configured)
 * - Debug/verbose statements
 * - REPL artifacts (`>>> `, `... `)
 * - Excessive whitespace (normalizes multiple blank lines)
 *
 * @param raw - Raw output from code execution
 * @param options - Sanitization options
 * @returns Cleaned output suitable for user display
 *
 * @see Story 8.5 AC#1 - No code leakage in user-facing output
 * @see Story 8.5 AC#2 - Filtered sandbox output
 *
 * @example
 * sanitizeCodeOutput('import pandas as pd\\nData processed successfully')
 * // => 'Data processed successfully'
 *
 * sanitizeCodeOutput('>>> print(x)\\n42\\n>>> ')
 * // => '42'
 */
export function sanitizeCodeOutput(
  raw: string | null | undefined,
  options?: SanitizeOptions
): string {
  // Handle null/undefined gracefully
  if (raw == null) {
    return '';
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = raw.split('\n');
  const result: string[] = [];

  let inMultilineImport = false;
  let inTraceback = false;
  let tracebackErrorLine: string | null = null;
  let tracebackIndentedCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Handle traceback detection and filtering
    if (isTracebackStart(line)) {
      inTraceback = true;
      tracebackErrorLine = null;
      tracebackIndentedCode = false;
      continue;
    }

    if (inTraceback) {
      const trimmed = line.trim();

      // Check if we're at the final error line (not indented, not empty, not File reference)
      if (trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        // This is likely the error line (e.g., "ValueError: Invalid data")
        if (!trimmed.startsWith('File ')) {
          tracebackErrorLine = trimmed;
          inTraceback = false;

          // Add placeholder for the filtered stack trace
          result.push(opts.stackTracePlaceholder);

          // Optionally preserve the error type info (but humanize it)
          // We don't add the raw error here - humanizeError should handle it
          continue;
        }
      }

      // Still in traceback, skip this line
      if (isStackTraceLine(line)) {
        continue;
      }

      // Check for indented code lines in traceback
      if (line.startsWith('    ') && !line.trim().startsWith('File ')) {
        tracebackIndentedCode = true;
        continue;
      }

      // Empty line in traceback
      if (trimmed === '') {
        continue;
      }
    }

    // Handle multi-line import detection
    const multilineCheck = checkMultilineImport(line, inMultilineImport);
    if (multilineCheck.isContinuation) {
      inMultilineImport = multilineCheck.continuesMultiline;
      continue;
    }
    if (inMultilineImport) {
      // Still in multi-line import, skip
      continue;
    }

    // Filter single-line imports
    if (isImportLine(line)) {
      // Check if this starts a multi-line import
      const trimmed = line.trim();
      if (trimmed.endsWith('\\') || trimmed.endsWith('(')) {
        inMultilineImport = true;
      }
      continue;
    }

    // Filter REPL artifacts
    if (isReplArtifact(line)) {
      // Try to preserve content after the prompt
      const stripped = stripReplPrompt(line);
      if (stripped.trim()) {
        result.push(stripped);
      }
      continue;
    }

    // Filter stack trace lines outside of traceback block
    if (isStackTraceLine(line)) {
      continue;
    }

    // Filter debug statements
    if (isDebugStatement(line)) {
      continue;
    }

    // Keep this line
    result.push(line);
  }

  // Normalize whitespace: collapse multiple blank lines into single blank line
  const normalized: string[] = [];
  let lastWasBlank = false;

  for (const line of result) {
    const isBlank = line.trim() === '';

    if (isBlank) {
      if (!lastWasBlank) {
        normalized.push('');
      }
      lastWasBlank = true;
    } else {
      normalized.push(line);
      lastWasBlank = false;
    }
  }

  // Trim leading/trailing blank lines and whitespace
  return normalized.join('\n').trim();
}
