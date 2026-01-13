# Story 8.5: Tool Call Summary & Sandbox Output Cleanup

Status: done

<!-- Note: This story was implemented prior to story file creation. Story file created retroactively for documentation. -->

## Story

As a user interacting with Orion,
I want clean, professional status messages during tool execution and filtered code output,
so that I never see raw Python imports, stack traces, or technical noise in Orion's responses.

## Acceptance Criteria

1. **AC1:** No Code Leakage - Python `import` statements, stack traces, and raw code NEVER shown to users
   - Import statements (single-line and multi-line) are filtered
   - Stack traces replaced with placeholder text
   - REPL artifacts (`>>> `, `... `) stripped from output

2. **AC2:** Filtered Sandbox Output - stdout/stderr from code execution is sanitized before display
   - Debug statements (`DEBUG:`, `[DEBUG]`, `VERBOSE:`) filtered
   - File path references (`File "/app/script.py"`) removed
   - Excessive whitespace normalized (multiple blank lines collapsed)

3. **AC3:** Consistent Summary Format - All tool calls use standardized format
   - Format: `{Action Verb} {Tool Name} - "{context}"`
   - Action verbs: Searching, Calling, Executing, Analyzing, Generating, Fetching
   - Context truncated at 40 chars with ellipsis if needed

4. **AC4:** User-Friendly Errors - Technical sandbox errors converted to helpful messages
   - Python error types mapped to friendly messages
   - JS/Node error codes (ECONNREFUSED, ETIMEDOUT) humanized
   - Technical details preserved for logging, user sees friendly text

5. **AC5:** Status Message Guidelines - Standard patterns documented in project-context.md
   - Forbidden content list: imports, stack traces, debug output, REPL artifacts
   - Module usage examples for formatToolSummary, sanitizeCodeOutput, humanizeError

6. **AC6:** Test Coverage - Unit tests verify filtering works for common leak scenarios
   - Tests for import filtering (single-line, multi-line, from...import)
   - Tests for stack trace detection and filtering
   - Tests for error humanization mapping

## Tasks / Subtasks

- [x] Task 1: Create Output Sanitizer Module (AC: #1, #2)
  - [x] Subtask 1.1: Implement `isImportLine()` for Python import detection
  - [x] Subtask 1.2: Implement `checkMultilineImport()` for multi-line import handling
  - [x] Subtask 1.3: Implement `isReplArtifact()` for REPL prompt detection
  - [x] Subtask 1.4: Implement `isTracebackStart()` and `isStackTraceLine()`
  - [x] Subtask 1.5: Implement `isDebugStatement()` for debug output filtering
  - [x] Subtask 1.6: Implement `sanitizeCodeOutput()` main function
  - [x] Subtask 1.7: Add whitespace normalization

- [x] Task 2: Create Tool Summary Formatter (AC: #3)
  - [x] Subtask 2.1: Define `ToolAction` type and `ACTION_VERBS` mapping
  - [x] Subtask 2.2: Implement `getActionVerb()` helper
  - [x] Subtask 2.3: Implement `formatToolSummary()` with context truncation
  - [x] Subtask 2.4: Implement `inferActionFromToolName()` for auto-detection
  - [x] Subtask 2.5: Implement `formatToolName()` for MCP tool name formatting

- [x] Task 3: Create Error Humanizer Module (AC: #4)
  - [x] Subtask 3.1: Define `ERROR_MESSAGES` mapping for Python/JS errors
  - [x] Subtask 3.2: Implement `extractPythonErrorType()` for stack trace parsing
  - [x] Subtask 3.3: Implement `extractJSErrorType()` for Node error handling
  - [x] Subtask 3.4: Implement `humanizeError()` main function
  - [x] Subtask 3.5: Implement `isRetryableError()` utility

- [x] Task 4: Update Documentation (AC: #5)
  - [x] Subtask 4.1: Add Tool Status Message Guidelines to project-context.md
  - [x] Subtask 4.2: Add Output Sanitization section with usage examples
  - [x] Subtask 4.3: Add Error Humanization section with mapping table
  - [x] Subtask 4.4: Update Anti-Patterns table with new rules

- [x] Task 5: Write Unit Tests (AC: #6)
  - [x] Subtask 5.1: Write tests for output-sanitizer.ts
  - [x] Subtask 5.2: Write tests for tool-summary.ts
  - [x] Subtask 5.3: Write tests for error-humanizer.ts

## Dev Notes

### Module Architecture

Story 8.5 introduced three new utility modules in `src/tools/`:

```
src/tools/
├── tool-summary.ts         # Status message formatting
├── tool-summary.test.ts    # Unit tests
├── output-sanitizer.ts     # Code output filtering
├── output-sanitizer.test.ts
├── error-humanizer.ts      # Error message conversion
└── error-humanizer.test.ts
```

### Tool Summary Format

All tool status messages follow a standardized format:

| Format | Example |
|--------|---------|
| With context | `Searching MSCI Reports - "Hulu Q3 revenue"` |
| Without context | `Calling Audience Manager` |
| Code execution | `Executing code - "generating Excel report"` |

Action verb mapping:
- `search` -> "Searching"
- `call` -> "Calling"
- `execute` -> "Executing"
- `analyze` -> "Analyzing"
- `generate` -> "Generating"
- `fetch` -> "Fetching"
- `run` -> "Running"

### Output Sanitization Pipeline

The `sanitizeCodeOutput()` function processes output through multiple filters:

1. **Traceback detection** - Detects `Traceback (most recent call last):` and filters entire block
2. **Import filtering** - Removes single-line (`import x`) and multi-line (`from x import (...)`) imports
3. **REPL artifact removal** - Strips `>>> ` and `... ` prompts, preserving content after
4. **Stack trace filtering** - Removes `File "..."` and `at line N` patterns
5. **Debug statement filtering** - Removes `DEBUG:`, `[DEBUG]`, `VERBOSE:` prefixed lines
6. **Whitespace normalization** - Collapses multiple blank lines into single blank line

### Error Type Mapping

Technical errors are mapped to user-friendly messages:

| Error Type | User Message |
|------------|--------------|
| `ModuleNotFoundError` | "The requested operation requires a capability that isn't available." |
| `TimeoutError` | "This operation took too long. Try simplifying your request." |
| `PermissionError` | "I don't have access to that resource." |
| `ConnectionError` | "Couldn't connect to the external service." |
| `ValueError` | "There was an issue with the data format. I'll try a different approach." |
| `ECONNREFUSED` | "Couldn't connect to the external service." |
| Unknown | "Something went wrong. I'll try a different approach." |

### Integration Points

These modules are used in the agent loop and Slack handlers:

```typescript
// In agent loop - format tool call status
import { formatToolSummary, inferActionFromToolName } from '../tools/tool-summary.js';

const action = inferActionFromToolName(toolName);
const status = formatToolSummary({ toolName, action, context: query });
await setStatus({ status });

// In code execution result handling
import { sanitizeCodeOutput } from '../tools/output-sanitizer.js';

const cleanOutput = sanitizeCodeOutput(rawPythonOutput);
// Display cleanOutput to user, not rawPythonOutput

// In error handling
import { humanizeError } from '../tools/error-humanizer.js';

const { userMessage, technicalDetails, errorType } = humanizeError(error);
logger.error({ event: 'tool.error', technicalDetails, errorType });
// Show userMessage to user, not technicalDetails
```

### Project Structure Notes

- All modules follow ESM import pattern with `.js` extension
- Co-located tests (*.test.ts alongside source)
- Type-safe exports with TypeScript interfaces
- No external dependencies added

### References

- [Source: _bmad-output/architecture.md#Epic 8 Repurposed: Anthropic API Enhancements]
- [Source: _bmad-output/epics.md#8.5 Tool Call Summary & Sandbox Output Cleanup]
- [Source: _bmad-output/project-context.md#Tool Status Message Guidelines]

## Dev Agent Record

### Agent Model Used

claude-opus-4-20250514

### Debug Log References

- No debug issues encountered
- All tests passing

### Completion Notes List

- Story implemented as part of Epic 8 sprint (2026-01-09 to 2026-01-11)
- Three utility modules created: tool-summary.ts, output-sanitizer.ts, error-humanizer.ts
- Documentation added to project-context.md (lines 862-992)
- All acceptance criteria verified through unit tests
- Story file created retroactively 2026-01-12 for documentation completeness

### File List

- `src/tools/tool-summary.ts` - Tool status message formatting
- `src/tools/tool-summary.test.ts` - Unit tests for tool-summary
- `src/tools/output-sanitizer.ts` - Code output sanitization
- `src/tools/output-sanitizer.test.ts` - Unit tests for output-sanitizer
- `src/tools/error-humanizer.ts` - Error message humanization
- `src/tools/error-humanizer.test.ts` - Unit tests for error-humanizer
- `_bmad-output/project-context.md` - Updated with Tool Status Message Guidelines section
