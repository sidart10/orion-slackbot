/**
 * Unit tests for Output Sanitizer Module.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#6 - Test coverage for filtering
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeCodeOutput,
  isCodeArtifact,
  isImportLine,
  isReplArtifact,
  isTracebackStart,
  isStackTraceLine,
  isDebugStatement,
  checkMultilineImport,
} from './output-sanitizer.js';

describe('output-sanitizer', () => {
  describe('isImportLine', () => {
    it('should detect standard import statement', () => {
      expect(isImportLine('import pandas')).toBe(true);
      expect(isImportLine('import pandas as pd')).toBe(true);
      expect(isImportLine('import os')).toBe(true);
    });

    it('should detect from...import statement', () => {
      expect(isImportLine('from datetime import datetime')).toBe(true);
      expect(isImportLine('from collections import defaultdict')).toBe(true);
      expect(isImportLine('from typing import List, Dict')).toBe(true);
    });

    it('should handle leading whitespace', () => {
      expect(isImportLine('  import pandas')).toBe(true);
      expect(isImportLine('    from os import path')).toBe(true);
    });

    it('should not match non-import lines', () => {
      expect(isImportLine('This import is important')).toBe(false);
      expect(isImportLine('Result: 42')).toBe(false);
      expect(isImportLine('# import pandas')).toBe(false);
    });

    it('should handle import in try/except block (preserve structure)', () => {
      // Import line itself should be detected as import
      expect(isImportLine('    import optional_module')).toBe(true);
      // But try/except structure is not import
      expect(isImportLine('try:')).toBe(false);
      expect(isImportLine('except ImportError:')).toBe(false);
      expect(isImportLine('    pass')).toBe(false);
    });
  });

  describe('isReplArtifact', () => {
    it('should detect REPL prompt', () => {
      expect(isReplArtifact('>>> print(x)')).toBe(true);
      expect(isReplArtifact('>>> ')).toBe(true);
    });

    it('should detect REPL continuation', () => {
      expect(isReplArtifact('... for i in range(10):')).toBe(true);
      expect(isReplArtifact('... ')).toBe(true);
    });

    it('should handle leading whitespace', () => {
      expect(isReplArtifact('  >>> print(x)')).toBe(true);
      expect(isReplArtifact('    ... continue')).toBe(true);
    });

    it('should not match non-REPL lines', () => {
      // Note: Lines starting with '>>> ' ARE REPL prompts, so '>>> is a prompt' would match
      expect(isReplArtifact('Normal output')).toBe(false);
      expect(isReplArtifact('The >>> symbol is used')).toBe(false); // >>> not at start
    });
  });

  describe('isTracebackStart', () => {
    it('should detect traceback start line', () => {
      expect(isTracebackStart('Traceback (most recent call last):')).toBe(true);
      expect(isTracebackStart('  Traceback (most recent call last):  ')).toBe(true);
    });

    it('should not match similar but different lines', () => {
      expect(isTracebackStart('Traceback information')).toBe(false);
      expect(isTracebackStart('Here is the traceback')).toBe(false);
    });
  });

  describe('isStackTraceLine', () => {
    it('should detect file reference lines', () => {
      expect(isStackTraceLine('  File "/app/script.py", line 42, in main')).toBe(true);
      expect(isStackTraceLine('  File "<stdin>", line 1')).toBe(true);
      expect(isStackTraceLine('File "/path/to/file.py", line 10')).toBe(true);
    });

    it('should detect "at line" patterns', () => {
      expect(isStackTraceLine('Error at line 42')).toBe(true);
      expect(isStackTraceLine('Syntax error at line 15')).toBe(true);
    });

    it('should not match normal output', () => {
      expect(isStackTraceLine('Result: 42')).toBe(false);
      expect(isStackTraceLine('Processing file...')).toBe(false);
    });
  });

  describe('isDebugStatement', () => {
    it('should detect DEBUG: prefix', () => {
      expect(isDebugStatement('DEBUG: entering function')).toBe(true);
      expect(isDebugStatement('  DEBUG: value is 42')).toBe(true);
    });

    it('should detect [DEBUG] prefix', () => {
      expect(isDebugStatement('[DEBUG] processing started')).toBe(true);
      expect(isDebugStatement('  [DEBUG] step 1')).toBe(true);
    });

    it('should detect VERBOSE: prefix', () => {
      expect(isDebugStatement('VERBOSE: detailed info')).toBe(true);
      expect(isDebugStatement('[VERBOSE] logging')).toBe(true);
    });

    it('should not match words containing DEBUG', () => {
      expect(isDebugStatement('DEBUGGING complete')).toBe(false);
      expect(isDebugStatement('Enable debug mode')).toBe(false);
    });
  });

  describe('isCodeArtifact', () => {
    it('should detect all code artifact types', () => {
      expect(isCodeArtifact('import pandas')).toBe(true);
      expect(isCodeArtifact('>>> print(x)')).toBe(true);
      expect(isCodeArtifact('DEBUG: test')).toBe(true);
      expect(isCodeArtifact('Traceback (most recent call last):')).toBe(true);
      expect(isCodeArtifact('  File "/app/script.py", line 42')).toBe(true);
    });

    it('should not match valid output', () => {
      expect(isCodeArtifact('Result: 42')).toBe(false);
      expect(isCodeArtifact('Processing complete')).toBe(false);
    });
  });

  describe('checkMultilineImport', () => {
    it('should detect multi-line import start with paren', () => {
      const result = checkMultilineImport('from module import (', false);
      expect(result.isContinuation).toBe(true);
      expect(result.continuesMultiline).toBe(true);
    });

    it('should detect continuation inside multi-line import', () => {
      const result = checkMultilineImport('    func_a,', true);
      expect(result.isContinuation).toBe(true);
      expect(result.continuesMultiline).toBe(true);
    });

    it('should detect end of multi-line import', () => {
      const result = checkMultilineImport(')', true);
      expect(result.isContinuation).toBe(true);
      expect(result.continuesMultiline).toBe(false);
    });

    it('should not match normal lines when not in multi-line', () => {
      const result = checkMultilineImport('result = 42', false);
      expect(result.isContinuation).toBe(false);
      expect(result.continuesMultiline).toBe(false);
    });
  });

  describe('sanitizeCodeOutput', () => {
    it('should handle null/undefined gracefully', () => {
      expect(sanitizeCodeOutput(null)).toBe('');
      expect(sanitizeCodeOutput(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(sanitizeCodeOutput('')).toBe('');
    });

    it('should handle whitespace-only input', () => {
      expect(sanitizeCodeOutput('   \n\n   ')).toBe('');
    });

    it('should filter single import line', () => {
      const input = 'import pandas as pd\nData processed successfully';
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('Data processed successfully');
    });

    it('should filter multiple import lines', () => {
      const input = `import pandas as pd
import numpy as np
from datetime import datetime

Data processed successfully`;
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('Data processed successfully');
    });

    it('should filter multi-line import with parentheses', () => {
      const input = `from mymodule import (
    function_a,
    function_b,
)

Result: 42`;
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('Result: 42');
    });

    it('should filter REPL prompts and preserve output', () => {
      // REPL output with prompts
      const input = `>>> x = 42
>>> print(x)
42`;
      const result = sanitizeCodeOutput(input);
      // Should preserve the output value but filter prompt lines
      // Note: stripReplPrompt extracts content after >>> for non-empty lines
      expect(result).toContain('42');
    });

    it('should handle standalone REPL prompts', () => {
      const input = `>>>
>>>
Result: done`;
      const result = sanitizeCodeOutput(input);
      expect(result).toContain('Result: done');
    });

    it('should filter stack trace and add placeholder', () => {
      const input = `Traceback (most recent call last):
  File "/app/script.py", line 42, in main
    result = process_data(data)
  File "/app/utils.py", line 15, in process_data
    return data.transform()
ValueError: Invalid data format`;
      const result = sanitizeCodeOutput(input);
      expect(result).toContain('[Error occurred during execution]');
      expect(result).not.toContain('File "/app/script.py"');
    });

    it('should filter debug statements', () => {
      const input = `DEBUG: starting process
Processing data...
[DEBUG] step 1 complete
Result: success
VERBOSE: cleanup done`;
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('Processing data...\nResult: success');
    });

    it('should normalize multiple blank lines', () => {
      const input = `First line


Second line



Third line`;
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('First line\n\nSecond line\n\nThird line');
    });

    it('should preserve meaningful output', () => {
      const input = `import pandas
Processing 100 rows...
Result: Average = 42.5
Summary complete`;
      const result = sanitizeCodeOutput(input);
      expect(result).toContain('Processing 100 rows...');
      expect(result).toContain('Result: Average = 42.5');
      expect(result).toContain('Summary complete');
      expect(result).not.toContain('import pandas');
    });

    it('should handle mixed valid and invalid output', () => {
      const input = `import pandas as pd
>>> df = pd.DataFrame()
DEBUG: DataFrame created
Processing started...
  File "/test.py", line 1
Analysis complete
VERBOSE: cleanup`;
      const result = sanitizeCodeOutput(input);
      expect(result).toContain('Processing started...');
      expect(result).toContain('Analysis complete');
      expect(result).not.toContain('import pandas');
      expect(result).not.toContain('DEBUG:');
      expect(result).not.toContain('VERBOSE:');
    });

    it('should handle edge case with only imports', () => {
      const input = `import os
import sys
from pathlib import Path`;
      const result = sanitizeCodeOutput(input);
      expect(result).toBe('');
    });

    it('should handle partial stack trace (file reference line)', () => {
      const input = `  File "/app/script.py", line 42, in main
Result: 42`;
      const result = sanitizeCodeOutput(input);
      // Stack trace file reference line should be filtered
      expect(result).toBe('Result: 42');
    });

    it('should preserve indented code that is not part of stack trace', () => {
      // Indented code that's not inside a traceback should be preserved
      const input = `Code output:
    result = process()
Result: 42`;
      const result = sanitizeCodeOutput(input);
      // The indented line is not in a traceback context, so preserved
      expect(result).toContain('result = process()');
      expect(result).toContain('Result: 42');
    });

    it('should use custom stack trace placeholder', () => {
      const input = `Traceback (most recent call last):
  File "/app/script.py", line 42, in main
ValueError: Invalid`;
      const result = sanitizeCodeOutput(input, {
        stackTracePlaceholder: '[An error occurred]',
      });
      expect(result).toContain('[An error occurred]');
    });

    it('should preserve try/except structure while filtering import', () => {
      // AC1 edge case: Conditional import in try/except block
      const input = `try:
    import optional_module
except ImportError:
    pass
Module check complete`;
      const result = sanitizeCodeOutput(input);
      // Should preserve try/except/pass but remove import line
      expect(result).toContain('try:');
      expect(result).toContain('except ImportError:');
      expect(result).toContain('pass');
      expect(result).toContain('Module check complete');
      expect(result).not.toContain('import optional_module');
    });
  });
});
