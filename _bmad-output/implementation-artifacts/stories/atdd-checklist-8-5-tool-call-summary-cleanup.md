# ATDD Checklist: Story 8.5 - Tool Call Summary & Sandbox Output Cleanup

**Story:** 8-5-tool-call-summary-cleanup
**Epic:** 8 - Anthropic API Enhancements
**Status:** VERIFIED (Story implemented and tests passing)
**Created:** 2026-01-12

---

## AC1: No Code Leakage - Python imports, stack traces, raw code NEVER shown to users

### Happy Path Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC1-HP-001 | Filter single import statement | `import pandas as pd\nData processed` | `Data processed` | PASS |
| AC1-HP-002 | Filter multiple import lines | `import pandas\nimport numpy\n\nResult: 42` | `Result: 42` | PASS |
| AC1-HP-003 | Filter from...import statement | `from datetime import datetime\nDone` | `Done` | PASS |

### Edge Cases

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC1-EC-001 | Import with leading whitespace | `  import pandas` | (filtered) | PASS |
| AC1-EC-002 | Multi-line import with parentheses | `from mymodule import (\n    func_a,\n)\nResult: 42` | `Result: 42` | PASS |
| AC1-EC-003 | Preserve code-like output that is NOT import | `Code output:\n    result = process()` | Preserved | PASS |
| AC1-EC-004 | Commented import line preserved | `# import pandas` | Preserved (not an actual import) | PASS |
| AC1-EC-005 | Text containing "import" word preserved | `This import is important` | Preserved | PASS |
| AC1-EC-006 | Conditional import in try/except | `try:\n    import optional\nexcept:\n    pass\nDone` | try/except structure preserved, import line filtered | PASS |

### Error Handling

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC1-ERR-001 | Full stack trace replacement | Python traceback with File refs | `[Error occurred during execution]` | PASS |
| AC1-ERR-002 | Partial stack trace (File reference) | `File "/app/script.py", line 42\nResult` | `Result` | PASS |
| AC1-ERR-003 | Custom stack trace placeholder | Traceback + custom placeholder option | Custom placeholder text shown | PASS |

### Boundary Conditions

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC1-BC-001 | Input is only imports (no output) | `import os\nimport sys\nfrom pathlib import Path` | Empty string | PASS |
| AC1-BC-002 | Empty input | `` | Empty string | PASS |
| AC1-BC-003 | Null/undefined input | `null` / `undefined` | Empty string | PASS |
| AC1-BC-004 | Whitespace-only input | `   \n\n   ` | Empty string | PASS |

---

## AC2: Filtered Sandbox Output - stdout/stderr sanitized before display

### Happy Path Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC2-HP-001 | Filter DEBUG: prefix | `DEBUG: starting\nResult: success` | `Result: success` | PASS |
| AC2-HP-002 | Filter [DEBUG] prefix | `[DEBUG] step 1\nDone` | `Done` | PASS |
| AC2-HP-003 | Filter VERBOSE: prefix | `VERBOSE: details\nComplete` | `Complete` | PASS |

### Edge Cases

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC2-EC-001 | Debug with leading whitespace | `  DEBUG: value is 42` | (filtered) | PASS |
| AC2-EC-002 | Multiple debug statement types mixed | `DEBUG: x\n[DEBUG] y\nVERBOSE: z\nResult` | `Result` | PASS |
| AC2-EC-003 | Word "DEBUG" in normal text preserved | `DEBUGGING complete` | Preserved | PASS |
| AC2-EC-004 | Enable debug mode text preserved | `Enable debug mode` | Preserved | PASS |

### REPL Artifact Filtering

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC2-REPL-001 | REPL prompt stripping | `>>> x = 42\n>>> print(x)\n42` | Contains `42` | PASS |
| AC2-REPL-002 | REPL continuation prompt | `... for i in range(10):` | (filtered/extracted) | PASS |
| AC2-REPL-003 | Standalone REPL prompts | `>>>\n>>>\nResult: done` | Contains `Result: done` | PASS |
| AC2-REPL-004 | >>> in middle of text preserved | `The >>> symbol is used` | Preserved | PASS |

### Whitespace Normalization

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC2-WS-001 | Multiple blank lines collapsed | `First\n\n\nSecond\n\n\n\nThird` | `First\n\nSecond\n\nThird` | PASS |

---

## AC3: Consistent Summary Format - Standardized tool call messages

### Happy Path Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-HP-001 | Search action with context | `{toolName: 'MSCI Reports', action: 'search', context: 'Hulu Q3 revenue'}` | `Searching MSCI Reports - "Hulu Q3 revenue"` | PASS |
| AC3-HP-002 | Call action with context | `{toolName: 'Audience Manager', action: 'call', context: 'segment ID 12345'}` | `Calling Audience Manager - "segment ID 12345"` | PASS |
| AC3-HP-003 | Execute action with context | `{toolName: 'code', action: 'execute', context: 'generating Excel report'}` | `Executing code - "generating Excel report"` | PASS |
| AC3-HP-004 | Analyze action with context | `{toolName: 'document', action: 'analyze', context: 'Q4 financial summary.pdf'}` | `Analyzing document - "Q4 financial summary.pdf"` | PASS |
| AC3-HP-005 | Generate action with context | `{toolName: 'Report', action: 'generate', context: 'quarterly summary'}` | `Generating Report - "quarterly summary"` | PASS |
| AC3-HP-006 | Fetch action with context | `{toolName: 'API', action: 'fetch', context: 'user data'}` | `Fetching API - "user data"` | PASS |

### Without Context

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-NC-001 | Search without context | `{toolName: 'Confluence', action: 'search'}` | `Searching Confluence` | PASS |
| AC3-NC-002 | Empty context string | `{toolName: 'API', action: 'call', context: ''}` | `Calling API` | PASS |
| AC3-NC-003 | Whitespace-only context | `{toolName: 'API', action: 'call', context: '   '}` | `Calling API` | PASS |

### Context Truncation

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-TR-001 | Long context truncated at default 40 chars | Context > 40 chars | Truncated with `...` | PASS |
| AC3-TR-002 | Custom maxContextLength respected | `{context: 'Short context here', maxContextLength: 10}` | `"Short cont..."` | PASS |
| AC3-TR-003 | Short context not truncated | Context < 40 chars | No truncation, no `...` | PASS |

### Tool Name Formatting

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-FMT-001 | MCP tool name (server__tool) | `msci-reports__search_reports` | `Msci Reports: Search Reports` | PASS |
| AC3-FMT-002 | Snake_case tool name | `search_user_data` | `Search User Data` | PASS |
| AC3-FMT-003 | Kebab-case tool name | `search-reports` | `Search Reports` | PASS |
| AC3-FMT-004 | Single word tool name | `search` | `Search` | PASS |

### Action Inference

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-INF-001 | Infer search from tool name | `search_reports`, `query_database`, `find_user` | `search` | PASS |
| AC3-INF-002 | Infer fetch from tool name | `get_user_data`, `fetch_records`, `list_items` | `fetch` | PASS |
| AC3-INF-003 | Infer generate from tool name | `generate_report`, `create_file`, `build_summary` | `generate` | PASS |
| AC3-INF-004 | Infer analyze from tool name | `analyze_data`, `process_input`, `parse_document` | `analyze` | PASS |
| AC3-INF-005 | Infer execute from tool name | `execute_code`, `run_script`, `code_runner` | `execute` | PASS |
| AC3-INF-006 | Default to call for unknown | `some_api_tool`, `random_tool` | `call` | PASS |

### Edge Cases

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| AC3-EC-001 | Empty action string | `'' as ToolAction` | `Using` (fallback verb) | PASS |
| AC3-EC-002 | Unknown action type | `'process' as ToolAction` | `Process` (capitalized) | PASS |
| AC3-EC-003 | Quotes in context | `context: 'query with "quotes"'` | Preserved in output | PASS |
| AC3-EC-004 | Newlines in context | `context: 'line1\nline2'` | Preserved | PASS |
| AC3-EC-005 | Special characters in context | `context: 'query & params = value'` | Preserved | PASS |

---

## AC4: User-Friendly Errors - Technical errors converted to helpful messages

### Python Error Mapping

| ID | Error Type | User Message Contains | Status |
|----|------------|----------------------|--------|
| AC4-PY-001 | `ModuleNotFoundError` | "capability that isn't available" | PASS |
| AC4-PY-002 | `TimeoutError` | "took too long" | PASS |
| AC4-PY-003 | `PermissionError` | "don't have access" | PASS |
| AC4-PY-004 | `ConnectionError` | "Couldn't connect" | PASS |
| AC4-PY-005 | `ValueError` | "data format" | PASS |
| AC4-PY-006 | `FileNotFoundError` | "couldn't be found" | PASS |
| AC4-PY-007 | `MemoryError` | "too many resources" | PASS |
| AC4-PY-008 | `json.JSONDecodeError` | "reading the data" | PASS |
| AC4-PY-009 | `asyncio.TimeoutError` | "took too long" | PASS |

### JavaScript/Node Error Mapping

| ID | Error Code | User Message Contains | Status |
|----|------------|----------------------|--------|
| AC4-JS-001 | `ECONNREFUSED` | "Couldn't connect" | PASS |
| AC4-JS-002 | `ETIMEDOUT` | "took too long" | PASS |
| AC4-JS-003 | JS `TypeError` | "technical issue" | PASS |

### Error Type Extraction

| ID | Test Scenario | Input | Expected errorType | Status |
|----|---------------|-------|-------------------|--------|
| AC4-EXT-001 | Simple error line | `ValueError: Invalid data` | `ValueError` | PASS |
| AC4-EXT-002 | Full stack trace | Complete Python traceback ending with error | Last error type | PASS |
| AC4-EXT-003 | Module-prefixed error | `json.JSONDecodeError: Expecting value` | `json.JSONDecodeError` | PASS |
| AC4-EXT-004 | Error object with code property | `Error.code = 'ECONNREFUSED'` | `ECONNREFUSED` | PASS |
| AC4-EXT-005 | Error code in message | `connect ETIMEDOUT 10.0.0.1:443` | `ETIMEDOUT` | PASS |

### Edge Cases and Fallbacks

| ID | Test Scenario | Input | Expected | Status |
|----|---------------|-------|----------|--------|
| AC4-EC-001 | Unknown error type | `SomeWeirdError: weird thing` | "Something went wrong" fallback | PASS |
| AC4-EC-002 | Null input | `null` | "Something went wrong", errorType: 'Unknown' | PASS |
| AC4-EC-003 | Undefined input | `undefined` | "Something went wrong", errorType: 'Unknown' | PASS |
| AC4-EC-004 | Empty string | `''` | "Something went wrong", errorType: 'Unknown' | PASS |
| AC4-EC-005 | Plain object | `{ message: 'test' }` | "Something went wrong" | PASS |
| AC4-EC-006 | Number | `500` | "Something went wrong" | PASS |

### Retryable Error Detection

| ID | Test Scenario | Error Type | isRetryable | Status |
|----|---------------|------------|-------------|--------|
| AC4-RET-001 | Connection errors retryable | `ConnectionError`, `ConnectionRefusedError`, `ECONNREFUSED` | `true` | PASS |
| AC4-RET-002 | Timeout errors retryable | `TimeoutError`, `asyncio.TimeoutError`, `ETIMEDOUT` | `true` | PASS |
| AC4-RET-003 | Value errors not retryable | `ValueError` | `false` | PASS |
| AC4-RET-004 | Type errors not retryable | `TypeError` | `false` | PASS |
| AC4-RET-005 | Module errors not retryable | `ModuleNotFoundError` | `false` | PASS |
| AC4-RET-006 | Permission errors not retryable | `PermissionError` | `false` | PASS |

### Technical Details Preservation

| ID | Test Scenario | Input | Expected | Status |
|----|---------------|-------|----------|--------|
| AC4-DET-001 | Full stack trace preserved for logging | Python traceback | `technicalDetails` contains Traceback | PASS |
| AC4-DET-002 | JS Error stack preserved | `new Error('Test')` | `technicalDetails` contains Error: Test | PASS |
| AC4-DET-003 | Module name preserved | `ModuleNotFoundError: No module 'pandas'` | `technicalDetails` contains 'pandas' | PASS |

---

## AC5: Status Message Guidelines - Documentation in project-context.md

### Documentation Verification

| ID | Requirement | Location | Status |
|----|-------------|----------|--------|
| AC5-DOC-001 | Forbidden content list documented | project-context.md | VERIFIED |
| AC5-DOC-002 | formatToolSummary usage examples | project-context.md | VERIFIED |
| AC5-DOC-003 | sanitizeCodeOutput usage examples | project-context.md | VERIFIED |
| AC5-DOC-004 | humanizeError usage examples | project-context.md | VERIFIED |
| AC5-DOC-005 | Anti-patterns table updated | project-context.md | VERIFIED |

---

## AC6: Test Coverage - Unit tests verify filtering

### Test File Coverage

| ID | Module | Test File | Test Count | Status |
|----|--------|-----------|------------|--------|
| AC6-COV-001 | output-sanitizer.ts | output-sanitizer.test.ts | 35+ tests | PASS |
| AC6-COV-002 | tool-summary.ts | tool-summary.test.ts | 30+ tests | PASS |
| AC6-COV-003 | error-humanizer.ts | error-humanizer.test.ts | 25+ tests | PASS |

### Coverage Categories

| Category | Tests Included | Status |
|----------|---------------|--------|
| Import filtering (single-line) | isImportLine tests | PASS |
| Import filtering (multi-line) | checkMultilineImport tests | PASS |
| Import filtering (from...import) | isImportLine tests | PASS |
| Stack trace detection | isTracebackStart, isStackTraceLine tests | PASS |
| Error humanization mapping | humanizeError tests for all error types | PASS |
| Action verb formatting | getActionVerb tests | PASS |
| Tool name inference | inferActionFromToolName tests | PASS |
| Context truncation | formatToolSummary truncation tests | PASS |

---

## Integration Points

### Dependencies

| Component | Dependency | Integration Test |
|-----------|------------|------------------|
| Agent Loop | tool-summary.ts | output-sanitization.integration.test.ts |
| Slack Handlers | output-sanitizer.ts | output-sanitization.integration.test.ts |
| Error Handling | error-humanizer.ts | output-sanitization.integration.test.ts |

---

## Summary

| AC | Total Tests | Passing | Status |
|----|-------------|---------|--------|
| AC1 | 13 | 13 | PASS |
| AC2 | 9 | 9 | PASS |
| AC3 | 23 | 23 | PASS |
| AC4 | 24 | 24 | PASS |
| AC5 | 5 | 5 | VERIFIED |
| AC6 | 3 modules | All | PASS |

**Overall Status:** ALL ACCEPTANCE CRITERIA VERIFIED

---

## Test Execution Command

```bash
pnpm test -- --run src/tools/output-sanitizer.test.ts src/tools/tool-summary.test.ts src/tools/error-humanizer.test.ts
```

---

## Notes

- Story 8.5 was implemented prior to story file creation (retroactive documentation)
- All three utility modules (`output-sanitizer.ts`, `tool-summary.ts`, `error-humanizer.ts`) have comprehensive unit tests
- Integration test exists at `src/tools/output-sanitization.integration.test.ts`
- Documentation verified in `_bmad-output/project-context.md` (lines 862-992)
