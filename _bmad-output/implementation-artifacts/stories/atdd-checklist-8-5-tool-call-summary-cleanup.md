# ATDD Checklist: 8-5-tool-call-summary-cleanup

**Story:** Tool Call Summary & Sandbox Output Cleanup
**Status:** ready-for-dev
**Generated:** 2026-01-11

---

## AC1: No Code Leakage in User-Facing Output

**Given** a PTC (Programmatic Tool Calling) code execution runs Python code,
**When** the execution produces stdout/stderr output,
**Then** Python import statements, module loading messages, and internal code MUST NOT appear in user-facing messages.

### Happy Path

- [ ] Test: Single import statement filtered from output
  - Given: Raw output `"import pandas as pd\nData processed successfully"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Data processed successfully"`

- [ ] Test: Multiple import statements filtered (block import)
  - Given: Raw output with `"import pandas\nimport numpy\nfrom datetime import datetime\nResult: 42"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Result: 42"`

- [ ] Test: Valid output preserved when no code artifacts present
  - Given: Raw output `"Analysis complete. Found 15 matches."`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is unchanged `"Analysis complete. Found 15 matches."`

### Edge Cases

- [ ] Test: Import mixed with valid output (interleaved)
  - Given: Raw output `"Loading...\nimport sys\nProcessing...\nfrom os import path\nDone."`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Loading...\nProcessing...\nDone."`

- [ ] Test: Multi-line import with parentheses
  - Given: Raw output with:
    ```
    from mymodule import (
        function_a,
        function_b,
    )
    Result: success
    ```
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Result: success"`

- [ ] Test: Multi-line import with backslash continuation
  - Given: Raw output with `"from module import \\\n    func1, func2\nOutput: data"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Output: data"`

- [ ] Test: Import with alias filtered
  - Given: Raw output `"import pandas as pd\nimport numpy as np\n5.0"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"5.0"`

- [ ] Test: Conditional import in try/except block
  - Given: Raw output with:
    ```
    try:
        import optional_module
    except ImportError:
        pass
    Module check complete
    ```
  - When: `sanitizeCodeOutput()` is called
  - Then: `"try:"`, `"except ImportError:"`, `"pass"`, and `"Module check complete"` preserved (only import line removed)

### Error Handling

- [ ] Test: Empty string input returns empty string
  - Given: Raw output `""`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `""`

- [ ] Test: Null/undefined input handled gracefully
  - Given: Raw output is `null` or `undefined`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `""` (empty string, no throw)

---

## AC2: Filtered Sandbox Output

**Given** Anthropic's code execution container (or GKE sandbox) produces output,
**When** the output is returned to the user,
**Then** specified patterns MUST be filtered out.

### Happy Path - Import Filtering

- [ ] Test: Lines starting with `import ` filtered
  - Given: Raw output `"import os\nFile created"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"File created"`

- [ ] Test: Lines with `from ... import` filtered
  - Given: Raw output `"from collections import defaultdict\nDictionary ready"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Dictionary ready"`

### Happy Path - REPL Artifacts

- [ ] Test: Python REPL `>>> ` artifacts filtered
  - Given: Raw output `">>> print(x)\n42\n>>> "`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"42"`

- [ ] Test: REPL continuation `... ` artifacts filtered
  - Given: Raw output `">>> for i in range(3):\n...     print(i)\n0\n1\n2"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"0\n1\n2"`

### Happy Path - Stack Trace Filtering

- [ ] Test: Full stack trace filtered, error message preserved
  - Given: Raw output:
    ```
    Traceback (most recent call last):
      File "/app/script.py", line 42, in main
        result = process_data(data)
      File "/app/utils.py", line 15, in process_data
        return data.transform()
    ValueError: Invalid data format
    ```
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"[Error occurred during execution]"` (preserves awareness of error)

- [ ] Test: Partial stack trace (File reference lines) filtered
  - Given: Raw output `"  File \"/app/module.py\", line 10, in func\nValid output after"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Valid output after"`

- [ ] Test: `File "<stdin>"` reference filtered
  - Given: Raw output `"  File \"<stdin>\", line 1\nUser input processed"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"User input processed"`

- [ ] Test: Lines containing `at line` filtered
  - Given: Raw output `"Error at line 42\nRecovered gracefully"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Recovered gracefully"`

### Happy Path - Debug Statement Filtering

- [ ] Test: `DEBUG:` prefix lines filtered
  - Given: Raw output `"DEBUG: entering function\nProcessing complete"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Processing complete"`

- [ ] Test: `[DEBUG]` prefix lines filtered
  - Given: Raw output `"[DEBUG] Loading config\nConfig loaded"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Config loaded"`

- [ ] Test: `VERBOSE:` prefix lines filtered
  - Given: Raw output `"VERBOSE: step 1 of 5\nStep completed"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Step completed"`

- [ ] Test: `[VERBOSE]` prefix lines filtered
  - Given: Raw output `"[VERBOSE] Detailed info\nSummary: success"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Summary: success"`

### Happy Path - Whitespace Normalization

- [ ] Test: Multiple consecutive blank lines normalized to single
  - Given: Raw output `"Line 1\n\n\n\nLine 2"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Line 1\n\nLine 2"` (single blank line)

- [ ] Test: Leading/trailing whitespace trimmed
  - Given: Raw output `"  \n\nActual content\n\n  "`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Actual content"`

- [ ] Test: Whitespace-only lines normalized
  - Given: Raw output `"Line 1\n   \n\t\nLine 2"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `"Line 1\n\nLine 2"`

### Edge Cases

- [ ] Test: Mixed valid/invalid output
  - Given: Raw output with imports, debug statements, stack trace, AND valid user output
  - When: `sanitizeCodeOutput()` is called
  - Then: Only valid user output preserved

- [ ] Test: Output that looks like import but is not (e.g., in a string)
  - Given: Raw output `"The command 'import data' was successful"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is unchanged (import inside string context preserved)

- [ ] Test: Valid output containing "DEBUG" as part of word
  - Given: Raw output `"DEBUGGING complete - no issues found"`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is unchanged (only `DEBUG:` prefix filtered)

### Error Handling

- [ ] Test: Whitespace-only input returns empty string
  - Given: Raw output `"   \n\t\n   "`
  - When: `sanitizeCodeOutput()` is called
  - Then: Output is `""`

---

## AC3: Consistent Tool Summary Format

**Given** any tool is called during agent execution,
**When** the status message is displayed to the user,
**Then** use the standardized format: `{Action} {Tool Name} - "{context}"`

### Happy Path

- [ ] Test: Search action formats correctly
  - Given: `{ toolName: 'MSCI Reports', action: 'search', context: 'Hulu Q3 revenue' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Searching MSCI Reports - "Hulu Q3 revenue"'`

- [ ] Test: Call action formats correctly
  - Given: `{ toolName: 'Audience Manager', action: 'call', context: 'segment ID 12345' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Calling Audience Manager - "segment ID 12345"'`

- [ ] Test: Execute action formats correctly
  - Given: `{ toolName: 'code', action: 'execute', context: 'generating Excel report' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Executing code - "generating Excel report"'`

- [ ] Test: Analyze action formats correctly
  - Given: `{ toolName: 'document', action: 'analyze', context: 'Q4 financial summary.pdf' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Analyzing document - "Q4 financial summary.pdf"'`

- [ ] Test: Generate action formats correctly
  - Given: `{ toolName: 'report', action: 'generate', context: 'weekly summary' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Generating report - "weekly summary"'`

- [ ] Test: Fetch action formats correctly
  - Given: `{ toolName: 'data', action: 'fetch', context: 'user preferences' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Fetching data - "user preferences"'`

### Edge Cases

- [ ] Test: Missing context omits quote section
  - Given: `{ toolName: 'Confluence', action: 'search' }` (no context)
  - When: `formatToolSummary()` is called
  - Then: Output is `'Searching Confluence'` (no dash or quotes)

- [ ] Test: Empty context treated as no context
  - Given: `{ toolName: 'API', action: 'call', context: '' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Calling API'`

- [ ] Test: Context truncation at maxContextLength (default 40)
  - Given: `{ toolName: 'Search', action: 'search', context: 'This is a very long context string that exceeds the default maximum length allowed' }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Searching Search - "This is a very long context string tha..."'` (truncated with ellipsis)

- [ ] Test: Custom maxContextLength honored
  - Given: `{ toolName: 'Search', action: 'search', context: '1234567890', maxContextLength: 5 }`
  - When: `formatToolSummary()` is called
  - Then: Output is `'Searching Search - "12345..."'`

- [ ] Test: Special characters in context escaped/preserved
  - Given: `{ toolName: 'Query', action: 'search', context: 'user said "hello"' }`
  - When: `formatToolSummary()` is called
  - Then: Output handles nested quotes appropriately

### Error Handling

- [ ] Test: Invalid action type defaults gracefully
  - Given: `{ toolName: 'Tool', action: 'unknown_action' as ToolAction }`
  - When: `formatToolSummary()` is called
  - Then: Output uses action as-is or has sensible fallback

---

## AC4: User-Friendly Error Messages

**Given** a sandbox execution or tool call fails with a technical error,
**When** displaying the error to the user,
**Then** convert to a user-friendly message.

### Happy Path - Known Error Types

- [ ] Test: ModuleNotFoundError humanized
  - Given: Error `"ModuleNotFoundError: No module named 'xyz'"`
  - When: `humanizeError()` is called
  - Then: Returns `"The requested operation requires a capability that isn't available. Try a different approach."`

- [ ] Test: TimeoutError humanized
  - Given: Error `"TimeoutError: Operation timed out"`
  - When: `humanizeError()` is called
  - Then: Returns `"This operation took too long. Try simplifying your request."`

- [ ] Test: asyncio.TimeoutError humanized
  - Given: Error `"asyncio.TimeoutError"`
  - When: `humanizeError()` is called
  - Then: Returns `"This operation took too long. Try simplifying your request."`

- [ ] Test: PermissionError humanized
  - Given: Error `"PermissionError: [Errno 13] Permission denied"`
  - When: `humanizeError()` is called
  - Then: Returns `"I don't have access to that resource. Please check permissions."`

- [ ] Test: ConnectionError humanized
  - Given: Error `"ConnectionError: Failed to establish connection"`
  - When: `humanizeError()` is called
  - Then: Returns `"Couldn't connect to the external service. It may be temporarily unavailable."`

- [ ] Test: HTTPError humanized
  - Given: Error `"HTTPError: 503 Service Unavailable"`
  - When: `humanizeError()` is called
  - Then: Returns `"Couldn't connect to the external service. It may be temporarily unavailable."`

### Happy Path - Error Object Handling

- [ ] Test: JavaScript Error object handled
  - Given: `new Error('Something went wrong')` with stack trace
  - When: `humanizeError()` is called
  - Then: Returns appropriate user-friendly message

- [ ] Test: Python stack trace parsed for error type
  - Given: Full stack trace ending with `"ValueError: Invalid input"`
  - When: `humanizeError()` is called
  - Then: Error type `ValueError` extracted and mapped

### Edge Cases

- [ ] Test: Unknown error falls back to generic message
  - Given: Error `"SomeCustomUnknownError: weird stuff happened"`
  - When: `humanizeError()` is called
  - Then: Returns `"Something went wrong. I'll try a different approach."`

- [ ] Test: Empty error message handled
  - Given: Error `""`
  - When: `humanizeError()` is called
  - Then: Returns generic fallback message

- [ ] Test: Error with no type identifier handled
  - Given: Error `"Something failed"`
  - When: `humanizeError()` is called
  - Then: Returns generic fallback message

### Error Handling

- [ ] Test: Technical details preserved for logging
  - Given: Error `"ModuleNotFoundError: No module named 'pandas'"`
  - When: `humanizeError()` is called
  - Then: Returns object with `userMessage`, `technicalDetails`, and `errorType`

- [ ] Test: technicalDetails contains original error
  - Given: Complex error with stack trace
  - When: `humanizeError()` is called
  - Then: `technicalDetails` field contains full original error for logging

---

## AC5: Status Message Guidelines Documented

**Given** a developer needs to add a new tool or update status messages,
**When** they reference the documentation,
**Then** clear guidelines exist in `project-context.md`.

### Happy Path

- [ ] Test: project-context.md contains "Tool Status Message Guidelines" section
  - Given: Documentation file `_bmad-output/project-context.md`
  - When: File is read
  - Then: Contains section with heading matching "Tool Status Message Guidelines"

- [ ] Test: Standard format documented
  - Given: Documentation exists
  - When: Reading format section
  - Then: Documents `{Action Verb} {Tool Name} - "{context}"` format

- [ ] Test: Action verbs documented
  - Given: Documentation exists
  - When: Reading action verbs section
  - Then: Documents: search, call, execute, analyze, generate, fetch

- [ ] Test: Examples provided for common tool types
  - Given: Documentation exists
  - When: Reading examples section
  - Then: Contains examples for search, API call, code execution, file processing

- [ ] Test: Forbidden content documented
  - Given: Documentation exists
  - When: Reading forbidden section
  - Then: Lists: Python imports, stack traces, debug output, raw stdout, internal paths

### Edge Cases

- [ ] Test: Anti-patterns table updated
  - Given: Documentation Anti-Patterns table
  - When: Reading table
  - Then: Contains entries for `sanitizeCodeOutput()`, `humanizeError()`, `formatToolSummary()`

---

## AC6: Test Coverage for Filtering

**Given** the output filtering module exists,
**When** tests are run,
**Then** unit tests verify filtering works for all specified cases.

### Test File Structure

- [ ] Test: Unit test file exists at `src/tools/output-sanitizer.test.ts`
  - Given: Project structure
  - When: Checking for test file
  - Then: File exists and is co-located with source

- [ ] Test: Unit test file exists at `src/tools/error-humanizer.test.ts`
  - Given: Project structure
  - When: Checking for test file
  - Then: File exists and is co-located with source

- [ ] Test: Unit test file exists at `src/tools/tool-summary.test.ts`
  - Given: Project structure
  - When: Checking for test file
  - Then: File exists and is co-located with source

### Sanitizer Test Coverage

- [ ] Test: Single import line removal tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for single import filtering

- [ ] Test: Block import removal tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for multi-line import filtering

- [ ] Test: Mixed output preservation tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for valid output preservation

- [ ] Test: Stack trace detection and filtering tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for stack trace filtering

- [ ] Test: Debug statement removal tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for DEBUG/VERBOSE filtering

- [ ] Test: REPL artifact removal tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for `>>> ` and `... ` removal

- [ ] Test: Whitespace normalization tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for blank line normalization

- [ ] Test: Edge cases (empty, null, whitespace-only) tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Tests exist and pass for all edge cases

- [ ] Test: Multiline import handling tested
  - Given: Test suite for `sanitizeCodeOutput`
  - When: Running tests
  - Then: Test exists and passes for parenthesized and backslash imports

### Error Humanizer Test Coverage

- [ ] Test: Known error type mapping tested
  - Given: Test suite for `humanizeError`
  - When: Running tests
  - Then: Tests exist for all specified error types

- [ ] Test: Unknown error fallback tested
  - Given: Test suite for `humanizeError`
  - When: Running tests
  - Then: Test exists for generic fallback message

- [ ] Test: Python stack trace parsing tested
  - Given: Test suite for `humanizeError`
  - When: Running tests
  - Then: Test exists for extracting error type from stack trace

- [ ] Test: JS Error object handling tested
  - Given: Test suite for `humanizeError`
  - When: Running tests
  - Then: Test exists for JavaScript Error instances

- [ ] Test: Technical details preservation tested
  - Given: Test suite for `humanizeError`
  - When: Running tests
  - Then: Test verifies `technicalDetails` field populated

### Tool Summary Test Coverage

- [ ] Test: All action types format correctly tested
  - Given: Test suite for `formatToolSummary`
  - When: Running tests
  - Then: Tests exist for search, call, execute, analyze, generate, fetch

- [ ] Test: Context truncation tested
  - Given: Test suite for `formatToolSummary`
  - When: Running tests
  - Then: Test exists for long context truncation with ellipsis

- [ ] Test: Missing context handling tested
  - Given: Test suite for `formatToolSummary`
  - When: Running tests
  - Then: Test exists for undefined/empty context

- [ ] Test: Special character escaping tested
  - Given: Test suite for `formatToolSummary`
  - When: Running tests
  - Then: Test exists for quotes and special chars in context

---

## Integration Tests

### Full Flow Tests

- [ ] Test: Code execution -> sanitized output -> user message flow
  - Given: PTC code execution produces raw output with imports and debug statements
  - When: Output flows through agent loop to Slack response
  - Then: User-facing message contains only clean, filtered output

- [ ] Test: Error flow -> humanized error -> user message
  - Given: Tool call fails with technical error (e.g., TimeoutError)
  - When: Error flows through agent loop to Slack response
  - Then: User sees friendly message, technical details logged with traceId

- [ ] Test: Tool status messages use consistent format
  - Given: Multiple tools called during agent execution
  - When: Status messages displayed to user
  - Then: All messages follow `{Action} {Tool Name} - "{context}"` format

### Regression Tests

- [ ] Test: Existing tool functionality not broken
  - Given: All existing tools (search, memory, MCP)
  - When: Integration tests run
  - Then: Tools continue to work as before with new formatting

- [ ] Test: Valid output not accidentally filtered
  - Given: Code execution produces legitimate output containing words like "import" in strings
  - When: Output is sanitized
  - Then: Legitimate output preserved (no false positives)

---

## Test Execution Commands

```bash
# Run output-sanitizer unit tests
pnpm test src/tools/output-sanitizer.test.ts

# Run error-humanizer unit tests
pnpm test src/tools/error-humanizer.test.ts

# Run tool-summary unit tests
pnpm test src/tools/tool-summary.test.ts

# Run all story 8.5 tests
pnpm test --grep "sanitize|humanize|tool-summary"

# Run with coverage
pnpm test --coverage src/tools/output-sanitizer.test.ts src/tools/error-humanizer.test.ts src/tools/tool-summary.test.ts
```

---

## Implementation Notes

### Test Data Setup

For comprehensive testing, create test fixtures with:

1. **Import variations:** Single, block, multi-line, aliased, conditional
2. **Stack trace samples:** Full Python traceback, partial, different error types
3. **Debug patterns:** All documented patterns (DEBUG:, [DEBUG], VERBOSE:, [VERBOSE])
4. **REPL artifacts:** >>> prompts, ... continuations
5. **Whitespace variations:** Blank lines, tabs, spaces, mixed

### ESM Import Pattern (MANDATORY)

```typescript
// In test files:
import { sanitizeCodeOutput, isCodeArtifact } from './output-sanitizer.js';
import { humanizeError } from './error-humanizer.js';
import { formatToolSummary } from './tool-summary.js';
```

### Mock Patterns

```typescript
// Vitest mock for logging (verify technical details logged)
vi.mock('../common/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
```

---

## Acceptance Criteria Traceability

| AC | Test Count | Coverage |
|----|------------|----------|
| AC1 | 11 tests | Import filtering, edge cases, error handling |
| AC2 | 21 tests | All filter patterns, whitespace, edge cases |
| AC3 | 11 tests | All actions, truncation, edge cases |
| AC4 | 12 tests | Error mapping, objects, technical details |
| AC5 | 6 tests | Documentation verification |
| AC6 | 18 tests | Test coverage verification |

**Total:** 79 test scenarios across 6 acceptance criteria

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | ATDD checklist created for Story 8.5 |
