# Story 7.7: Skill-Aware & Response-Content Suggested Prompts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want suggested prompts that surface available skills and adapt to response content,
So that I discover powerful capabilities like spreadsheet generation and file creation that I might not know exist.

## Acceptance Criteria

1. **Given** Orion has skills loaded (xlsx, pdf, summarize, etc.), **When** prompts are generated, **Then** at least one prompt hints at an available skill capability

2. **Given** a response mentions data or information that could be exported, **When** follow-up prompts are generated, **Then** prompts include skill-specific suggestions (e.g., "Create a spreadsheet", "Generate a PDF report")

3. **Given** a response includes analysis or research, **When** follow-up prompts are generated, **Then** prompts suggest relevant skill-based outputs (e.g., "Visualize this data", "Create a presentation")

4. **Given** the Skills API returns available skill IDs, **When** the prompt factory is called, **Then** skill metadata is used to generate relevant prompts

5. **Given** a user has already used a skill in the conversation, **When** prompts are generated, **Then** related skill follow-ups are suggested (e.g., after xlsx creation: "Add charts", "Create another sheet")

6. **Given** prompts are displayed, **When** the user views them, **Then** maximum 4 prompts are shown (Slack API limit preserved from 7.1)

## Tasks / Subtasks

- [x] **Task 1: Extend PromptContext Interface** (AC: #4)
  - [x] Add `availableSkills?: SkillInfo[]` to PromptContext
  - [x] Add `responseContent?: string` for analyzing response text
  - [x] Add `usedSkillInResponse?: string` for tracking skill used in response
  - [x] Add `usedSkillsInThread?: string[]` for tracking skill usage
  - [x] Update type exports

- [x] **Task 2: Create Skill Prompt Generator** (AC: #1, #4)
  - [x] Create `src/slack/prompts/skill-prompts.ts`
  - [x] Implement `getSkillAwarePrompts(skills: SkillInfo[])` function
  - [x] Map skill names to user-friendly prompt suggestions:
    - `xlsx` -> "Create a spreadsheet with this data"
    - `pdf` -> "Generate a PDF report"
    - `docx` -> "Create a Word document"
    - `summarize` -> "Summarize a conversation"
    - `d3js-visualization` -> "Create a data visualization"
    - `algorithmic-art` -> "Generate visual artwork"
    - `frontend-design` -> "Design a UI mockup"
  - [x] Return max 2 skill prompts to blend with context prompts

- [x] **Task 3: Create Response Content Analyzer** (AC: #2, #3)
  - [x] Create `analyzeResponseForSkillPrompts(responseText: string, availableSkills: string[])` function
  - [x] Detect patterns suggesting exportable content:
    - Data tables or lists -> suggest xlsx
    - Research/analysis -> suggest pdf, docx
    - Numerical data -> suggest d3js-visualization
    - Design discussion -> suggest frontend-design
  - [x] Return skill-specific follow-up prompts
  - [x] Add unit tests for pattern detection

- [x] **Task 4: Create Skill Follow-Up Prompts** (AC: #5)
  - [x] Implement `getSkillFollowUpPrompts(usedSkill: string)` function
  - [x] Define follow-up prompts per skill:
    - After `xlsx`: "Add a chart", "Create another sheet", "Format as table"
    - After `pdf`: "Add more sections", "Change formatting", "Include images"
    - After `summarize`: "Summarize another thread", "Export to document"
  - [x] Add unit tests for each skill type

- [x] **Task 5: Integrate with Prompt Factory** (AC: all)
  - [x] Modify `generateSuggestedPrompts()` in `prompt-factory.ts`
  - [x] Add skill-aware prompt blending logic:
    - If skills available: blend 1-2 skill prompts with context prompts
    - If response content analyzed: prioritize relevant skill prompts
    - If skill was used: show skill-specific follow-ups
  - [x] Maintain max 4 prompts total (AC: #6)
  - [x] Ensure backwards compatibility with existing prompt generation

- [x] **Task 6: Pass Skills to Prompt Factory** (AC: #4)
  - [x] Update `handleThreadStarted` to pass available skills
  - [x] Update `handleUserMessage` to pass:
    - Available skills from skill registry
    - Response content for analysis
    - Skills used in current thread (from thread context)
  - [x] Get skills from skillRegistry via getAvailableSkillsForPrompts()

- [x] **Task 7: Add Unit Tests** (AC: all)
  - [x] Test skill-aware prompt generation with various skill sets
  - [x] Test response content analysis for different content types
  - [x] Test skill follow-up prompts for each supported skill
  - [x] Test prompt blending maintains max 4 limit
  - [x] Test backwards compatibility (no skills = existing behavior)

- [x] **Task 8: Verification** (AC: all)
  - [x] All 81 tests pass (33 in skill-prompts.test.ts, 48 in prompt-factory.test.ts)
  - [x] Build succeeds with no type errors
  - [x] Full test suite passes (1459 tests)

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR16 | prd.md | System provides suggested prompts to help users discover capabilities |
| FR24 | prd.md | Developers can add new Skills via Agent Skills open standard |
| UX Spec | ux-design-specification.md | Dynamic prompts based on context, progressive discovery |

### Existing Implementation (Story 7.1)

Story 7.1 established the prompt factory at `src/slack/prompts/prompt-factory.ts` with:
- Context-aware base prompts (DM vs channel)
- Time-based prompts (morning/EOD)
- Response-type follow-ups (research, action, error, clarification)

This story extends that foundation with skill awareness.

### Skills System Context

From `project-context.md` and `architecture.md`:

**Skills API Integration:**
```typescript
// Skills are loaded at startup via initializeSkills()
// Skill IDs stored in memory registry
// Available via containerLifecycle or skill registry service
import { skillsApi } from '../skills/api-client.js';
import { containerLifecycle } from '../skills/index.js';
```

**Available Skills (from .skills/ directory):**
| Skill | Description | Prompt Hint |
|-------|-------------|-------------|
| xlsx | Spreadsheet creation | "Create a spreadsheet" |
| pdf | PDF generation | "Generate a PDF report" |
| docx | Word document creation | "Create a document" |
| summarize | Conversation summarization | "Summarize a thread" |
| d3js-visualization | Data visualization | "Visualize this data" |
| algorithmic-art | Visual artwork | "Generate artwork" |
| frontend-design | UI mockup design | "Design a UI" |
| mcp-builder | MCP server creation | N/A (developer tool) |
| skill-creator | New skill creation | N/A (developer tool) |
| webapp-testing | Playwright testing | N/A (developer tool) |
| web-artifacts-builder | Web artifact builds | N/A (developer tool) |

### Proposed Implementation

**src/slack/prompts/skill-prompts.ts:**
```typescript
import type { SuggestedPrompt } from './prompt-factory.js';

// Import actual type from skills module
import type { SkillRegistryEntry } from '../../skills/types.js';

// SkillRegistryEntry has: name, skillId, type, version, contentHash?, lastSynced?
// NOTE: Registry entries do NOT have description - use SKILL_PROMPT_MAP for user-friendly text

// Map skills to user-friendly prompts
const SKILL_PROMPT_MAP: Record<string, SuggestedPrompt> = {
  xlsx: {
    title: 'Create spreadsheet',
    message: 'Create a spreadsheet with this data',
  },
  pdf: {
    title: 'Generate PDF',
    message: 'Generate a PDF report from this information',
  },
  docx: {
    title: 'Create document',
    message: 'Create a Word document with this content',
  },
  summarize: {
    title: 'Summarize thread',
    message: 'Summarize a conversation',
  },
  'd3js-visualization': {
    title: 'Visualize data',
    message: 'Create a visualization of this data',
  },
  'algorithmic-art': {
    title: 'Generate artwork',
    message: 'Generate visual artwork based on...',
  },
  'frontend-design': {
    title: 'Design UI',
    message: 'Design a UI mockup for...',
  },
};

// Skills to exclude from prompts (developer tools)
const EXCLUDED_SKILLS = [
  'mcp-builder',
  'skill-creator',
  'webapp-testing',
  'web-artifacts-builder',
  'example',
];

/**
 * Generate skill-aware prompts from available skills
 * @param skills - Array of SkillRegistryEntry from skillRegistry
 * @returns Max 2 skill prompts to blend with context prompts
 */
export function getSkillAwarePrompts(skills: SkillRegistryEntry[]): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = [];

  for (const skill of skills) {
    if (EXCLUDED_SKILLS.includes(skill.name)) continue;

    const prompt = SKILL_PROMPT_MAP[skill.name];
    if (prompt && prompts.length < 2) {
      prompts.push(prompt);
    }
  }

  return prompts;
}

/**
 * Analyze response content to suggest relevant skill prompts
 */
export function analyzeResponseForSkillPrompts(
  responseText: string,
  availableSkills: string[]
): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = [];
  const lowerText = responseText.toLowerCase();

  // Data/table patterns -> xlsx
  if (availableSkills.includes('xlsx') &&
      (lowerText.includes('data') ||
       lowerText.includes('table') ||
       lowerText.includes('numbers') ||
       /\d+.*\d+.*\d+/.test(responseText))) {
    prompts.push({
      title: 'Export to Excel',
      message: 'Create a spreadsheet with this data',
    });
  }

  // Research/analysis patterns -> pdf
  if (availableSkills.includes('pdf') &&
      (lowerText.includes('research') ||
       lowerText.includes('analysis') ||
       lowerText.includes('findings') ||
       lowerText.includes('report'))) {
    prompts.push({
      title: 'Create PDF report',
      message: 'Generate a PDF report with these findings',
    });
  }

  // Visualization patterns -> d3js
  if (availableSkills.includes('d3js-visualization') &&
      (lowerText.includes('trend') ||
       lowerText.includes('comparison') ||
       lowerText.includes('growth') ||
       lowerText.includes('chart'))) {
    prompts.push({
      title: 'Visualize this',
      message: 'Create a visualization of this data',
    });
  }

  return prompts.slice(0, 2);
}

/**
 * Get follow-up prompts after a skill was used
 */
export function getSkillFollowUpPrompts(usedSkill: string): SuggestedPrompt[] {
  switch (usedSkill) {
    case 'xlsx':
      return [
        { title: 'Add a chart', message: 'Add a chart to visualize this data' },
        { title: 'Add formulas', message: 'Add calculations and formulas' },
        { title: 'Create another', message: 'Create another spreadsheet for...' },
        { title: 'Format table', message: 'Format this as a professional table' },
      ];
    case 'pdf':
      return [
        { title: 'Add sections', message: 'Add more sections to the report' },
        { title: 'Change style', message: 'Change the formatting style' },
        { title: 'Add visuals', message: 'Add charts or images' },
        { title: 'Create another', message: 'Create another PDF for...' },
      ];
    case 'summarize':
      return [
        { title: 'Another thread', message: 'Summarize another conversation' },
        { title: 'Export summary', message: 'Create a document with this summary' },
        { title: 'More detail', message: 'Expand on specific points' },
        { title: 'Action items', message: 'Extract action items from this' },
      ];
    default:
      return [];
  }
}
```

**Updated PromptContext:**
```typescript
export interface PromptContext {
  channelType: 'im' | 'channel' | 'group';
  userId: string;
  channelId?: string;
  threadHistory?: string[];
  lastResponseType?: 'research' | 'action' | 'error' | 'clarification';
  errorCode?: string;
  hourOfDay?: number;
  // New fields for skill awareness (Story 7.7)
  // Uses SkillRegistryEntry from src/skills/types.ts
  availableSkills?: SkillRegistryEntry[];
  responseContent?: string;
  usedSkillInResponse?: string;
  usedSkillsInThread?: string[]; // Track all skills used in thread history
}
```

**Integration in prompt-factory.ts:**
```typescript
export function generateSuggestedPrompts(context: PromptContext): SuggestedPrompt[] {
  let prompts: SuggestedPrompt[];

  // If a skill was just used, show skill-specific follow-ups
  if (context.usedSkillInResponse) {
    prompts = getSkillFollowUpPrompts(context.usedSkillInResponse);
    if (prompts.length > 0) {
      return prompts.slice(0, MAX_PROMPTS);
    }
  }

  // Existing response-type based logic...
  if (context.lastResponseType) {
    // ... existing switch statement
  } else {
    // ... existing time-based / base prompts
  }

  // Blend in skill-aware prompts
  if (context.availableSkills && context.availableSkills.length > 0) {
    // Analyze response content for relevant skill suggestions
    if (context.responseContent) {
      const skillNames = context.availableSkills.map(s => s.name);
      const contentPrompts = analyzeResponseForSkillPrompts(
        context.responseContent,
        skillNames
      );
      if (contentPrompts.length > 0) {
        // Replace last 1-2 prompts with skill-specific ones
        prompts = [...prompts.slice(0, MAX_PROMPTS - contentPrompts.length), ...contentPrompts];
      }
    } else {
      // No response content - add general skill hints
      const skillPrompts = getSkillAwarePrompts(context.availableSkills);
      if (skillPrompts.length > 0) {
        // Replace last prompt with a skill hint
        prompts = [...prompts.slice(0, MAX_PROMPTS - 1), skillPrompts[0]];
      }
    }
  }

  return prompts.slice(0, MAX_PROMPTS);
}
```

### Integration Points

**In handleUserMessage:**
```typescript
import { skillRegistry } from '../../skills/index.js';
import type { SkillRegistryEntry } from '../../skills/types.js';

// After response is generated - get skill metadata from registry
// NOTE: skillRegistry does NOT have getLoadedSkills() - use getAllSkillIds() + getSkillMetadata()
function getAvailableSkillEntries(): SkillRegistryEntry[] {
  const skillIds = skillRegistry.getAllSkillIds();
  const entries: SkillRegistryEntry[] = [];
  for (const id of skillIds) {
    const metadata = skillRegistry.getSkillMetadata(id);
    if (metadata) entries.push(metadata);
  }
  return entries;
}

const availableSkills = getAvailableSkillEntries();
const usedSkillInResponse = detectSkillUsage(response); // Check if code_execution used a skill

await setSuggestedPrompts({
  title: 'What next?',
  prompts: generateSuggestedPrompts({
    channelType: context.channelType,
    userId: context.userId,
    lastResponseType: responseType,
    availableSkills,
    responseContent: responseText,
    usedSkillInResponse,
  }),
});
```

### Dependencies

- Story 7.1 (Dynamic Suggested Prompts) - extends existing prompt factory
- Epic 6 (Skills Framework) - requires skill registry access
- Story 6.4 (Skill Registry Service) - provides skill metadata

### File Structure Notes

Alignment with unified project structure:
```
src/slack/prompts/
├── prompt-factory.ts       # Existing - modify to integrate skill awareness
├── prompt-factory.test.ts  # Existing - add skill-aware tests
├── skill-prompts.ts        # NEW - skill prompt generation
└── skill-prompts.test.ts   # NEW - skill prompt tests
```

### Testing Standards

From `project-context.md`:
- Co-located tests: `*.test.ts` alongside source
- Use Vitest
- Mock skill registry for unit tests
- Test max 4 prompt limit in all scenarios

### References

- [Source: _bmad-output/project-context.md] - PTC + Skills implementation details
- [Source: _bmad-output/architecture.md#Agent-Skills-Implementation] - Skills API integration
- [Source: src/slack/prompts/prompt-factory.ts] - Existing prompt factory implementation
- [Source: Story 7.1] - Original dynamic prompts implementation
- [Source: .skills/*/SKILL.md] - Available skill definitions

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None required - all tests pass.

### Completion Notes List

1. Story 7.7 implementation complete with all 6 acceptance criteria verified.
2. Created new skill-prompts.ts module with 3 exported functions: getSkillAwarePrompts, analyzeResponseForSkillPrompts, getSkillFollowUpPrompts.
3. Extended PromptContext interface with 4 new optional fields for skill awareness.
4. Integrated skill awareness into both handleThreadStarted and handleUserMessage handlers.
5. Added helper functions getAvailableSkillsForPrompts() and detectSkillUsage() in prompt-factory.ts.
6. All 81 skill-related tests pass (33 in skill-prompts.test.ts, 48 in prompt-factory.test.ts).
7. Full test suite passes with 1459 tests (2 skipped).
8. Build succeeds with no type errors.

### File List

| File | Change |
|------|--------|
| src/slack/prompts/skill-prompts.ts | Created - skill prompt generation functions (278 lines) |
| src/slack/prompts/skill-prompts.test.ts | Created - unit tests for skill prompts (387 lines, 33 tests) |
| src/slack/prompts/prompt-factory.ts | Modified - added SkillInfo interface, skill blending logic, detectSkillUsage(), getAvailableSkillsForPrompts() |
| src/slack/prompts/prompt-factory.test.ts | Modified - added skill-aware test suites (773 lines, 48 tests) |
| src/slack/handlers/user-message.ts | Modified - calls getAvailableSkillsForPrompts() and detectSkillUsage() to pass skill context |
| src/slack/handlers/thread-started.ts | Modified - calls getAvailableSkillsForPrompts() to pass available skills to prompt factory |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | Story created via Ralph autonomous orchestration |
| 2026-01-11 | TEA validation: Fixed Critical #1 - replaced non-existent `skillRegistry.getLoadedSkills()` with `getAllSkillIds()` + `getSkillMetadata()` pattern |
| 2026-01-11 | TEA validation: Fixed Critical #2 - replaced custom `SkillMetadata` interface with actual `SkillRegistryEntry` from `src/skills/types.ts` |
| 2026-01-12 | Story Done: All 8 tasks complete, 81 tests pass, build succeeds, status updated to done |
