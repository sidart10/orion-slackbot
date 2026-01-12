# ATDD Checklist: 7-8-enhanced-slack-ui-polish

**Story:** Enhanced Slack UI Polish
**Epic:** 7 - Slack Polish
**Generated:** 2026-01-11

---

## AC1: Standardize Section Headers

### Happy Path
- [ ] Test: All response sections use Slack mrkdwn bold format
  - Given: A formatting constant is defined for a section header
  - When: The constant is used in a response
  - Then: The header renders as `*Section Name*` (single asterisk bold)

- [ ] Test: No markdown `##` headers in any response
  - Given: A formatted response is generated
  - When: The response content is inspected
  - Then: No `##` or `###` markdown headers are present

- [ ] Test: Headers use Title Case consistently
  - Given: The SECTION_HEADERS constant is defined
  - When: Each header value is examined
  - Then: All headers follow Title Case formatting (e.g., `*Key Findings*` not `*key findings*`)

### Edge Cases
- [ ] Test: Empty section does not render header
  - Given: A section has no content to display
  - When: The response is formatted
  - Then: The empty section header is omitted entirely

- [ ] Test: Long header names wrap correctly in Slack
  - Given: A header like `*Unresolved Questions*` is used
  - When: Viewed in Slack mobile vs desktop
  - Then: The header displays without breaking formatting

### Error Handling
- [ ] Test: Invalid header format is caught at build time
  - Given: A developer adds a header without `*` wrapping
  - When: TypeScript compilation runs
  - Then: Type error is raised (if using const assertion)

---

## AC2: Remove Emoji Prefix Clutter

### Happy Path
- [ ] Test: Section headers have no emoji prefixes
  - Given: A summary response is generated
  - When: The `*Summary*` header is rendered
  - Then: No emoji precedes the header (e.g., no magnifying glass, lightbulb, etc.)

- [ ] Test: Response body text is professional without emoji decoration
  - Given: A full response with multiple sections
  - When: The body text is examined
  - Then: No emojis appear in body text content

- [ ] Test: Status indicators still use allowed emojis
  - Given: An error or warning status message
  - When: The status is displayed
  - Then: Only allowed status emojis appear (if any defined in STATUS_EMOJI constant)

### Edge Cases
- [ ] Test: Conversation type icons in summarization are minimal
  - Given: A conversation summary with different message types
  - When: The summary is formatted
  - Then: Message type indicators are used sparingly (not every line)

- [ ] Test: Legacy responses with emojis are updated
  - Given: An existing formatter that had emoji prefixes
  - When: The formatter is audited and updated
  - Then: The new output has no emoji prefixes in headers

### Error Handling
- [ ] Test: Emoji in user content is preserved
  - Given: A user message contains emojis
  - When: The message is quoted or referenced
  - Then: User's emojis are preserved (don't strip user content)

### Boundary Conditions
- [ ] Test: Empty STATUS_EMOJI values don't cause rendering issues
  - Given: STATUS_EMOJI constants are empty strings
  - When: A status message is formatted
  - Then: No extra spaces or undefined values appear

---

## AC3: Formatting Constants (NEW FILE)

### Happy Path
- [ ] Test: formatting-constants.ts file is created
  - Given: The story implementation is complete
  - When: The file system is checked
  - Then: `src/slack/formatting-constants.ts` exists

- [ ] Test: SECTION_HEADERS constant contains all required headers
  - Given: The SECTION_HEADERS constant is exported
  - When: Its keys are enumerated
  - Then: All headers are present: summary, keyFindings, keyDecisions, actionItems, topicsDiscussed, unresolvedQuestions, participants, references, nextSteps, error, alternatives

- [ ] Test: All header values use Slack mrkdwn bold format
  - Given: Each value in SECTION_HEADERS
  - When: The value is pattern-matched
  - Then: Value matches regex `/^\*[A-Z][^*]+\*:?$/` (starts/ends with asterisk, Title Case)

- [ ] Test: RESPONSE_STRUCTURE constant defines correct order
  - Given: The RESPONSE_STRUCTURE constant
  - When: Its values are read in order
  - Then: Order is: value, details, references, actions

- [ ] Test: Constants are properly exported
  - Given: Another file imports from formatting-constants.ts
  - When: The import statement is `import { SECTION_HEADERS, RESPONSE_STRUCTURE, STATUS_EMOJI } from '../slack/formatting-constants.js'`
  - Then: All constants are accessible without error

### Edge Cases
- [ ] Test: ESM import extension is correct
  - Given: The file is imported from another module
  - When: Using `.js` extension in import path
  - Then: Runtime import succeeds

- [ ] Test: Constants are immutable
  - Given: The constants use `as const`
  - When: Attempting to modify at runtime
  - Then: TypeScript prevents mutation

### Error Handling
- [ ] Test: Missing constant import fails at compile time
  - Given: A typo in import statement
  - When: TypeScript compilation runs
  - Then: Compile-time error for unknown export

---

## AC4: Response Template Consistency

### Happy Path
- [ ] Test: Standard response leads with value first
  - Given: A successful search/summarization response
  - When: The response structure is analyzed
  - Then: First content block is the answer/result, not context or preamble

- [ ] Test: Supporting details are bulleted
  - Given: A response with multiple detail points
  - When: The details section is formatted
  - Then: Each point uses bullet format (`- ` or `* `)

- [ ] Test: References section appears after details
  - Given: A response with sources
  - When: The response structure is checked
  - Then: References section follows details, precedes actions

- [ ] Test: Feedback prompt appears last (if applicable)
  - Given: A response that includes a feedback call-to-action
  - When: The response structure is checked
  - Then: Feedback/action prompt is at the end

- [ ] Test: Summarization responses follow same pattern
  - Given: A conversation summary is generated
  - When: The response structure is analyzed
  - Then: Structure is: Summary (value) -> Details (bullets) -> References (if any) -> Actions

- [ ] Test: Error responses follow pattern with alternatives
  - Given: A tool execution fails
  - When: The error response is formatted
  - Then: Structure is: Error message -> What went wrong -> Alternatives

### Edge Cases
- [ ] Test: Response with no references omits References section
  - Given: A response generated without source citations
  - When: The response is formatted
  - Then: No empty `*References:*` header appears

- [ ] Test: Response with no actions omits Actions section
  - Given: A simple response with no follow-up needed
  - When: The response is formatted
  - Then: No empty action prompt appears

### Boundary Conditions
- [ ] Test: Very long responses maintain structure
  - Given: A response with many detail points (10+)
  - When: Formatted according to template
  - Then: Structure remains consistent, sections are still distinguishable

---

## AC5: Audit and Fix Existing Formatters

### Happy Path
- [ ] Test: format-summary.ts uses SECTION_HEADERS constants
  - Given: The format-summary.ts file is audited
  - When: Import statements are checked
  - Then: It imports from formatting-constants.js

- [ ] Test: generate-summary.ts prompt specifies Slack mrkdwn
  - Given: The summarization prompt in generate-summary.ts
  - When: The prompt text is examined
  - Then: Explicit instructions for `*bold*` format are present

- [ ] Test: user-message.ts response formatting is consistent
  - Given: The user-message handler formats a response
  - When: Output is examined
  - Then: Uses formatting constants, no `##` headers, no emoji clutter

- [ ] Test: app-mention.ts response formatting is consistent
  - Given: The app-mention handler formats a response
  - When: Output is examined
  - Then: Uses formatting constants, no `##` headers, no emoji clutter

- [ ] Test: sources-block.ts is NOT modified
  - Given: The story implementation is complete
  - When: Git diff for sources-block.ts is checked
  - Then: File is unchanged (owned by Story 8.1)

### Edge Cases
- [ ] Test: Prompt templates in other tools follow formatting
  - Given: Any tool that has LLM prompts with formatting instructions
  - When: The prompt is examined
  - Then: Instructions specify Slack mrkdwn, not markdown

### Error Handling
- [ ] Test: Formatting constants import error fails gracefully
  - Given: A formatter cannot import constants (hypothetical)
  - When: The import fails
  - Then: Fallback to inline constants with same values (if applicable)

---

## AC6: Update Summarization Formatting

### Happy Path
- [ ] Test: Summary sections have no emoji prefixes
  - Given: A conversation summary is generated
  - When: Section headers are examined
  - Then: Headers are `*Summary*`, `*Key Decisions*`, etc. without emojis

- [ ] Test: Summary uses standardized section names
  - Given: A full conversation summary
  - When: Section names are listed
  - Then: Names match SECTION_HEADERS constants exactly

- [ ] Test: Prompt explicitly instructs Slack mrkdwn format
  - Given: The generate-summary.ts prompt
  - When: Formatting instructions are read
  - Then: Includes explicit rules: `*bold*` not `**bold**`, `<url|text>` for links

- [ ] Test: LLM output follows prompt formatting rules
  - Given: Claude generates a summary using the prompt
  - When: The raw output is examined
  - Then: Output uses `*bold*` headers (not markdown `**bold**`)

### Edge Cases
- [ ] Test: Empty sections are omitted
  - Given: A conversation with no action items
  - When: Summary is generated
  - Then: `*Action Items*` section does not appear

- [ ] Test: Maximum 5 items per section enforced
  - Given: A busy conversation with 10 key decisions
  - When: Summary is generated
  - Then: `*Key Decisions*` section has at most 5 items

### Boundary Conditions
- [ ] Test: Very short conversation summary
  - Given: A conversation with only 2 messages
  - When: Summary is generated
  - Then: Only relevant sections appear, minimal structure maintained

- [ ] Test: Conversation with no decisions/actions
  - Given: A purely informational thread
  - When: Summary is generated
  - Then: Only `*Summary*` and `*Topics Discussed*` sections appear

---

## AC7: Langfuse Observability

### Happy Path
- [ ] Test: Existing traces work after formatting changes
  - Given: A request that triggers summarization
  - When: The response is generated with new formatting
  - Then: Langfuse trace captures the request without error

- [ ] Test: No new spans are introduced for formatting
  - Given: The trace structure before and after changes
  - When: Compared side by side
  - Then: No new span types for formatting logic (formatting is inline, not traced)

### Edge Cases
- [ ] Test: Formatting errors do not break tracing
  - Given: A hypothetical formatting constant error
  - When: The error occurs during response generation
  - Then: Trace captures the error, request completes with fallback

### Error Handling
- [ ] Test: Trace metadata is not polluted with formatting details
  - Given: A typical Langfuse trace
  - When: Metadata is examined
  - Then: No unnecessary formatting metadata clutters the trace

---

## Integration Tests

### Cross-Cutting Scenarios

- [ ] Test: End-to-end summary request with new formatting
  - Given: A user requests a channel summary
  - When: The full flow executes (request -> LLM -> format -> respond)
  - Then: Response uses all new formatting patterns consistently

- [ ] Test: Error response uses new formatting
  - Given: A tool call fails
  - When: Error response is formatted
  - Then: Uses `*Error*`, `*Alternatives*` headers with no emojis

- [ ] Test: Multiple handlers produce consistent formatting
  - Given: Requests via app-mention AND user-message handlers
  - When: Both generate responses
  - Then: Formatting is indistinguishable (same patterns)

- [ ] Test: Slack renders formatted response correctly
  - Given: A response with `*bold*` headers and bullet lists
  - When: Viewed in Slack (desktop and mobile)
  - Then: Bold renders as bold, lists render cleanly

### Regression Tests

- [ ] Test: Existing test suite passes
  - Given: All existing unit and integration tests
  - When: `pnpm test` is run
  - Then: All tests pass (no regressions)

- [ ] Test: TypeScript compilation succeeds
  - Given: All source files including new formatting-constants.ts
  - When: `pnpm build` is run
  - Then: Compilation succeeds with no errors

---

## Definition of Done Verification

- [ ] `src/slack/formatting-constants.ts` created as NEW file
- [ ] `generate-summary.ts` prompt updated with Slack mrkdwn instructions
- [ ] `format-summary.ts` imports and uses formatting constants
- [ ] Handler response formatting audited (user-message.ts, app-mention.ts)
- [ ] Unit tests added for formatting-constants (minimum 2 tests)
- [ ] All existing tests pass
- [ ] Manual Slack verification completed
- [ ] No markdown `##` headers in any response
- [ ] No emojis in section headers
- [ ] sources-block.ts NOT modified (verified via git diff)

---

## Test Coverage Matrix

| Acceptance Criterion | Happy Path | Edge Case | Error Handling | Boundary |
|---------------------|------------|-----------|----------------|----------|
| AC1: Section Headers | 3 tests | 2 tests | 1 test | - |
| AC2: Emoji Removal | 3 tests | 2 tests | 1 test | 1 test |
| AC3: Formatting Constants | 5 tests | 2 tests | 1 test | - |
| AC4: Response Template | 6 tests | 2 tests | - | 1 test |
| AC5: Audit Formatters | 5 tests | 1 test | 1 test | - |
| AC6: Summarization | 4 tests | 2 tests | - | 2 tests |
| AC7: Langfuse | 2 tests | 1 test | 1 test | - |
| Integration | 4 tests | - | - | - |
| **Total** | **32 tests** | **10 tests** | **5 tests** | **4 tests** |

**Grand Total: 51 test scenarios**
