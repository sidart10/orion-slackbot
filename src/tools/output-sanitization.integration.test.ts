/**
 * Integration tests for Output Sanitization Flow.
 *
 * Tests the end-to-end flow from:
 * - Code execution output -> sanitized output -> user message
 * - Tool error -> humanized error -> user message
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#6 - Test coverage for filtering
 */

import { describe, it, expect } from 'vitest';
import { sanitizeCodeOutput } from './output-sanitizer.js';
import { humanizeError, type HumanizedError } from './error-humanizer.js';
import { formatToolSummary, inferActionFromToolName, type ToolAction } from './tool-summary.js';

describe('Output Sanitization Integration', () => {
  /**
   * Test full flow: code execution -> sanitized output
   */
  describe('Code Execution Output Flow (AC#1, AC#2)', () => {
    it('should clean realistic PTC output with imports and results', () => {
      // Simulate realistic code execution output from PTC
      const rawOutput = `import pandas as pd
import numpy as np
from datetime import datetime

DEBUG: Loading data...
>>> df = pd.DataFrame()
Processing 1000 rows...
[DEBUG] Row processing complete
Analysis Results:
- Total: 42,500
- Average: 85.0
- Max: 150
>>> df.head()
VERBOSE: cleanup started
Done.`;

      const sanitized = sanitizeCodeOutput(rawOutput);

      // Should preserve meaningful results
      expect(sanitized).toContain('Processing 1000 rows...');
      expect(sanitized).toContain('Analysis Results:');
      expect(sanitized).toContain('Total: 42,500');
      expect(sanitized).toContain('Done.');

      // Should filter technical noise
      expect(sanitized).not.toContain('import pandas');
      expect(sanitized).not.toContain('import numpy');
      expect(sanitized).not.toContain('DEBUG:');
      expect(sanitized).not.toContain('[DEBUG]');
      expect(sanitized).not.toContain('VERBOSE:');
      expect(sanitized).not.toContain('>>>');
    });

    it('should clean output with stack trace and preserve context', () => {
      const rawOutput = `Starting analysis...
Data loaded: 500 records
Traceback (most recent call last):
  File "/app/analysis.py", line 42, in main
    result = process_data(data)
  File "/app/utils.py", line 15, in process_data
    return data.transform()
ValueError: Invalid data format in column 'date'`;

      const sanitized = sanitizeCodeOutput(rawOutput);

      // Should preserve context before error
      expect(sanitized).toContain('Starting analysis...');
      expect(sanitized).toContain('Data loaded: 500 records');

      // Should have error placeholder
      expect(sanitized).toContain('[Error occurred during execution]');

      // Should filter stack trace details
      expect(sanitized).not.toContain('File "/app/');
      expect(sanitized).not.toContain('Traceback');
    });

    it('should handle empty or null output gracefully', () => {
      expect(sanitizeCodeOutput(null)).toBe('');
      expect(sanitizeCodeOutput(undefined)).toBe('');
      expect(sanitizeCodeOutput('')).toBe('');
      expect(sanitizeCodeOutput('   \n\n   ')).toBe('');
    });
  });

  /**
   * Test full flow: tool error -> humanized error
   */
  describe('Error Humanization Flow (AC#4)', () => {
    it('should convert Python stack trace to user-friendly message', () => {
      const pythonError = `Traceback (most recent call last):
  File "/app/main.py", line 10, in main
    import_data()
ModuleNotFoundError: No module named 'special_library'`;

      const humanized = humanizeError(pythonError);

      expect(humanized.errorType).toBe('ModuleNotFoundError');
      expect(humanized.userMessage).toContain("capability that isn't available");
      expect(humanized.technicalDetails).toContain('special_library');
    });

    it('should handle connection errors with retry suggestion', () => {
      const connectionError = new Error('connect ECONNREFUSED 10.0.0.1:5432') as Error & { code: string };
      connectionError.code = 'ECONNREFUSED';

      const humanized = humanizeError(connectionError);

      expect(humanized.errorType).toBe('ECONNREFUSED');
      expect(humanized.userMessage).toContain("Couldn't connect");
      expect(humanized.userMessage).toContain('temporarily unavailable');
    });

    it('should preserve technical details for logging', () => {
      const error = new TypeError('Cannot read properties of undefined');

      const humanized = humanizeError(error);

      // User-friendly message
      expect(humanized.userMessage).toContain('technical issue');

      // Technical details preserved for logging
      expect(humanized.technicalDetails).toContain('TypeError');
      expect(humanized.technicalDetails).toContain('Cannot read properties');
    });
  });

  /**
   * Test full flow: tool summary formatting
   */
  describe('Tool Summary Formatting Flow (AC#3)', () => {
    it('should format search tools correctly', () => {
      const toolName = 'msci-reports__search_reports';
      const action = inferActionFromToolName(toolName);

      expect(action).toBe('search');

      const summary = formatToolSummary({
        toolName: 'MSCI Reports: Search Reports',
        action,
        context: 'Q4 revenue data',
      });

      expect(summary).toBe('Searching MSCI Reports: Search Reports - "Q4 revenue data"');
    });

    it('should format API call tools correctly', () => {
      const summary = formatToolSummary({
        toolName: 'Audience Manager',
        action: 'call',
        context: 'segment lookup',
      });

      expect(summary).toBe('Calling Audience Manager - "segment lookup"');
    });

    it('should format code execution tools correctly', () => {
      const summary = formatToolSummary({
        toolName: 'code',
        action: 'execute',
        context: 'generating Excel report',
      });

      expect(summary).toBe('Executing code - "generating Excel report"');
    });

    it('should handle missing context', () => {
      const summary = formatToolSummary({
        toolName: 'Calendar',
        action: 'fetch',
      });

      expect(summary).toBe('Fetching Calendar');
    });

    it('should truncate long context appropriately', () => {
      const longContext = 'This is a very long context string that should be truncated for display purposes';

      const summary = formatToolSummary({
        toolName: 'Search',
        action: 'search',
        context: longContext,
        maxContextLength: 30,
      });

      expect(summary).toContain('...');
      expect(summary.length).toBeLessThan(`Searching Search - "${longContext}"`.length);
    });
  });

  /**
   * Test combined flow: realistic tool execution scenario
   */
  describe('Combined Realistic Scenarios', () => {
    it('should handle a complete code execution cycle', () => {
      // 1. Format status message
      const statusMessage = formatToolSummary({
        toolName: 'Analysis Engine',
        action: 'execute',
        context: 'processing sales data',
      });
      expect(statusMessage).toBe('Executing Analysis Engine - "processing sales data"');

      // 2. Simulate code execution output
      const rawOutput = `import pandas as pd
from datetime import datetime
DEBUG: Starting analysis
Processing sales data...
Results:
- Q1: $1.2M
- Q2: $1.5M
- Q3: $1.8M
- Q4: $2.1M
Total: $6.6M`;

      const sanitizedOutput = sanitizeCodeOutput(rawOutput);

      // Verify clean output
      expect(sanitizedOutput).toContain('Processing sales data...');
      expect(sanitizedOutput).toContain('Total: $6.6M');
      expect(sanitizedOutput).not.toContain('import pandas');
      expect(sanitizedOutput).not.toContain('DEBUG:');
    });

    it('should handle error scenario end-to-end', () => {
      // 1. Simulate code execution failure
      const rawError = `import pandas as pd
DEBUG: Loading dataset
Traceback (most recent call last):
  File "/app/analyzer.py", line 42, in analyze
    df = pd.read_csv(path)
FileNotFoundError: [Errno 2] No such file or directory: 'data.csv'`;

      // 2. Sanitize the output
      const sanitizedOutput = sanitizeCodeOutput(rawError);
      expect(sanitizedOutput).toContain('[Error occurred during execution]');
      expect(sanitizedOutput).not.toContain('import pandas');

      // 3. Humanize the error
      const humanized = humanizeError(rawError);
      expect(humanized.errorType).toBe('FileNotFoundError');
      expect(humanized.userMessage).toContain("couldn't be found");

      // 4. Verify we have both user message and technical details
      expect(humanized.technicalDetails).toContain('data.csv');
    });
  });
});
