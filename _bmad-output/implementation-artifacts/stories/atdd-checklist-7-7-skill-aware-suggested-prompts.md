# ATDD Checklist: 7-7-skill-aware-suggested-prompts

**Story:** Skill-Aware & Response-Content Suggested Prompts
**Generated:** 2026-01-11
**Test Framework:** Vitest (co-located tests)
**Source Story:** `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/_bmad-output/implementation-artifacts/stories/7-7-skill-aware-suggested-prompts.md`

---

## AC1: Skill Hints in Generated Prompts

**Given** Orion has skills loaded (xlsx, pdf, summarize, etc.), **When** prompts are generated, **Then** at least one prompt hints at an available skill capability

### Happy Path

- [ ] **Test: Skill prompts included when skills available**
  - Given: PromptContext with `availableSkills: [{ name: 'xlsx', skillId: 'skl_123', type: 'custom', version: '1' }]`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains at least one prompt with title/message related to spreadsheet creation

- [ ] **Test: Multiple skills produce blended prompts**
  - Given: PromptContext with `availableSkills` containing xlsx, pdf, and summarize skills
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains 1-2 skill-related prompts blended with context prompts

### Edge Cases

- [ ] **Test: Empty skills array produces standard prompts**
  - Given: PromptContext with `availableSkills: []`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains only base/time-based prompts (no skill prompts)

- [ ] **Test: Undefined availableSkills produces standard prompts**
  - Given: PromptContext without `availableSkills` field
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains only base/time-based prompts (backwards compatible)

- [ ] **Test: Only excluded skills loaded produces no skill prompts**
  - Given: PromptContext with `availableSkills: [{ name: 'mcp-builder', ... }, { name: 'skill-creator', ... }]`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains no skill-related prompts (developer tools excluded)

### Error Handling

- [ ] **Test: Malformed skill entry is gracefully skipped**
  - Given: PromptContext with one valid and one malformed skill entry (missing name)
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Valid skill prompt is generated, no error thrown

---

## AC2: Response Content Triggers Skill Export Prompts

**Given** a response mentions data or information that could be exported, **When** follow-up prompts are generated, **Then** prompts include skill-specific suggestions (e.g., "Create a spreadsheet", "Generate a PDF report")

### Happy Path

- [ ] **Test: Data/table content triggers xlsx prompt**
  - Given: PromptContext with `responseContent: "Here is the data table with quarterly sales figures..."` and xlsx in `availableSkills`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes prompt with title "Export to Excel"

- [ ] **Test: Research/analysis content triggers pdf prompt**
  - Given: PromptContext with `responseContent: "Based on my research and analysis of the market findings..."` and pdf in `availableSkills`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes prompt with title "Create PDF report"

- [ ] **Test: Content analysis integrated into generateSuggestedPrompts**
  - Given: PromptContext with `responseContent` containing data patterns and xlsx skill available
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result includes skill-specific export prompt (replaces 1-2 base prompts)

### Edge Cases

- [ ] **Test: Response content without exportable patterns**
  - Given: PromptContext with `responseContent: "Hello! How can I help you today?"` and all skills available
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result is empty array (no skill prompts triggered)

- [ ] **Test: Exportable content but skill not available**
  - Given: PromptContext with `responseContent: "Here is the data table..."` but xlsx NOT in `availableSkills`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result does not include xlsx prompt (only suggest available skills)

- [ ] **Test: Empty response content**
  - Given: PromptContext with `responseContent: ""`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result is empty array

- [ ] **Test: Case insensitive pattern matching**
  - Given: PromptContext with `responseContent: "Here is the DATA TABLE..."` (uppercase)
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result still triggers xlsx prompt (case insensitive)

### Boundary Conditions

- [ ] **Test: Multiple patterns match - limit to 2 prompts**
  - Given: PromptContext with `responseContent: "Here is the research data with table analysis and findings showing growth trends..."` and all skills available
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result contains maximum 2 prompts (not all matching patterns)

---

## AC3: Research/Analysis Suggests Relevant Skill Outputs

**Given** a response includes analysis or research, **When** follow-up prompts are generated, **Then** prompts suggest relevant skill-based outputs (e.g., "Visualize this data", "Create a presentation")

### Happy Path

- [ ] **Test: Trend data suggests visualization**
  - Given: PromptContext with `responseContent: "The trend shows consistent growth over the period..."` and d3js-visualization in `availableSkills`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes prompt with title "Visualize this"

- [ ] **Test: Comparison content suggests visualization**
  - Given: PromptContext with `responseContent: "Comparing options A and B, we see significant differences..."` and d3js-visualization in `availableSkills`
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes visualization prompt

### Edge Cases

- [ ] **Test: Chart mention triggers visualization prompt**
  - Given: PromptContext with `responseContent: "This would work well as a chart..."` and d3js-visualization available
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes visualization prompt

- [ ] **Test: Numeric content with multiple numbers**
  - Given: PromptContext with `responseContent: "Revenue was 100, then 150, then 200 over three quarters"` and xlsx available
  - When: `analyzeResponseForSkillPrompts(responseContent, skillNames)` is called
  - Then: Result includes xlsx prompt (numeric pattern detected)

---

## AC4: Skills API Metadata Used in Prompt Generation

**Given** the Skills API returns available skill IDs, **When** the prompt factory is called, **Then** skill metadata is used to generate relevant prompts

### Happy Path

- [ ] **Test: SkillRegistryEntry used correctly**
  - Given: PromptContext with `availableSkills` containing SkillRegistryEntry objects (name, skillId, type, version)
  - When: `getSkillAwarePrompts(skills)` is called
  - Then: Function uses `skill.name` to lookup prompts in SKILL_PROMPT_MAP

- [ ] **Test: Skill mapping covers all user-facing skills**
  - Given: Skills array with all user-facing skills: ['xlsx', 'pdf', 'docx', 'summarize', 'd3js-visualization', 'algorithmic-art', 'frontend-design']
  - When: Each skill is passed to `getSkillAwarePrompts()`
  - Then: Each produces a valid prompt (no undefined lookups)

### Edge Cases

- [ ] **Test: Unknown skill name gracefully handled**
  - Given: PromptContext with `availableSkills: [{ name: 'unknown-skill', skillId: 'skl_999', type: 'custom', version: '1' }]`
  - When: `getSkillAwarePrompts(skills)` is called
  - Then: Result is empty array (no error thrown, unknown skill skipped)

- [ ] **Test: Mixed known and unknown skills**
  - Given: PromptContext with skills including 'xlsx', 'unknown-skill', 'pdf'
  - When: `getSkillAwarePrompts(skills)` is called
  - Then: Result includes prompts for xlsx and pdf only

### Boundary Conditions

- [ ] **Test: Maximum 2 skill prompts returned**
  - Given: PromptContext with all 7 user-facing skills loaded
  - When: `getSkillAwarePrompts(skills)` is called
  - Then: Result contains exactly 2 prompts (not more)

---

## AC5: Skill Follow-Up Prompts After Skill Usage

**Given** a user has already used a skill in the conversation, **When** prompts are generated, **Then** related skill follow-ups are suggested (e.g., after xlsx creation: "Add charts", "Create another sheet")

### Happy Path

- [ ] **Test: xlsx follow-ups after spreadsheet creation**
  - Given: PromptContext with `usedSkillInResponse: 'xlsx'`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains xlsx-specific follow-ups: "Add a chart", "Add formulas", etc.

- [ ] **Test: pdf follow-ups after PDF generation**
  - Given: PromptContext with `usedSkillInResponse: 'pdf'`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains pdf-specific follow-ups: "Add sections", "Change style", etc.

- [ ] **Test: summarize follow-ups after thread summarization**
  - Given: PromptContext with `usedSkillInResponse: 'summarize'`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains summarize-specific follow-ups: "Another thread", "Export summary", etc.

- [ ] **Test: Skill follow-ups take priority over base prompts**
  - Given: PromptContext with `usedSkillInResponse: 'xlsx'` and morning time
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains xlsx follow-ups (not time-based prompts)

### Edge Cases

- [ ] **Test: Unknown skill usage returns empty follow-ups**
  - Given: `usedSkill: 'unknown-skill'`
  - When: `getSkillFollowUpPrompts(usedSkill)` is called
  - Then: Result is empty array

- [ ] **Test: Skill follow-up with empty usedSkillInResponse**
  - Given: PromptContext with `usedSkillInResponse: ''`
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Normal prompt generation (no skill follow-ups)

- [ ] **Test: Null/undefined usedSkillInResponse**
  - Given: PromptContext without `usedSkillInResponse` field
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Normal prompt generation (backwards compatible)

### Boundary Conditions

- [ ] **Test: Each supported skill has follow-ups defined**
  - Given: Skills with follow-ups: ['xlsx', 'pdf', 'summarize']
  - When: `getSkillFollowUpPrompts(skill)` is called for each
  - Then: Each returns non-empty array

- [ ] **Test: Follow-up prompts do not exceed MAX_PROMPTS**
  - Given: `usedSkill: 'xlsx'` which has 4 follow-up prompts defined
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result contains maximum 4 prompts

---

## AC6: Maximum 4 Prompts Enforced

**Given** prompts are displayed, **When** the user views them, **Then** maximum 4 prompts are shown (Slack API limit preserved from 7.1)

### Happy Path

- [ ] **Test: Standard prompt generation respects limit**
  - Given: Any valid PromptContext
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result array length is <= 4

- [ ] **Test: Skill blending maintains 4 prompt limit**
  - Given: PromptContext with `availableSkills` and `responseContent` that would generate many prompts
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result array length is exactly 4 (not more)

### Edge Cases

- [ ] **Test: Skill follow-ups respect MAX_PROMPTS**
  - Given: Skill with many follow-up prompts defined (e.g., 6 prompts)
  - When: Follow-ups are generated and returned
  - Then: Result array length is <= 4

- [ ] **Test: Content analysis + skill prompts + base prompts**
  - Given: PromptContext with all features: availableSkills, responseContent with patterns, and base channel context
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result array length is exactly 4

### Boundary Conditions

- [ ] **Test: Exactly 4 prompts when conditions allow**
  - Given: PromptContext that would generate exactly 4 prompts
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result array length is 4

- [ ] **Test: Less than 4 when fewer prompts available**
  - Given: PromptContext with limited skill follow-ups (e.g., unknown skill returns 0)
  - When: `generateSuggestedPrompts(context)` is called
  - Then: Result array may be less than 4 but still valid

---

## Integration Tests

### PromptContext Interface Extension

- [ ] **Test: New fields are optional (backwards compatibility)**
  - Given: Existing code using PromptContext without new fields
  - When: Compiled with TypeScript
  - Then: No type errors (all new fields are optional)

- [ ] **Test: Full PromptContext with all skill fields**
  - Given: PromptContext with all new fields: `availableSkills`, `responseContent`, `usedSkillInResponse`, `usedSkillsInThread`
  - When: Passed to `generateSuggestedPrompts()`
  - Then: Function executes without error and returns valid prompts

### Prompt Factory Integration

- [ ] **Test: generateSuggestedPrompts handles all priority scenarios**
  - Given: Test matrix of priority scenarios:
    1. `usedSkillInResponse` set (highest priority)
    2. `lastResponseType` set
    3. `responseContent` with patterns + skills
    4. `availableSkills` only
    5. Time-based prompts (hourOfDay)
    6. Base prompts (lowest priority)
  - When: Each scenario is tested
  - Then: Correct priority order is followed

### Handler Integration Points

- [ ] **Test: handleThreadStarted can pass availableSkills**
  - Given: Mock skill registry with loaded skills
  - When: Thread started handler builds PromptContext
  - Then: Context includes `availableSkills` from registry

- [ ] **Test: handleUserMessage passes response content and skills**
  - Given: Mock response with text content and skill registry
  - When: User message handler builds PromptContext after response
  - Then: Context includes `responseContent` and `availableSkills`

- [ ] **Test: Skill usage detection in response**
  - Given: Response that includes code_execution tool call for xlsx skill
  - When: Skill usage is detected
  - Then: `usedSkillInResponse` is set to 'xlsx' in PromptContext

---

## Unit Test File Structure

```
src/slack/prompts/
  prompt-factory.test.ts       # Existing - extend with skill-aware tests
  skill-prompts.test.ts        # NEW - dedicated skill prompt tests
```

### skill-prompts.test.ts Test Suites

- [ ] **Suite: getSkillAwarePrompts()**
  - Tests for SKILL_PROMPT_MAP lookups
  - Tests for EXCLUDED_SKILLS filtering
  - Tests for max 2 prompt limit

- [ ] **Suite: analyzeResponseForSkillPrompts()**
  - Tests for data/table pattern detection
  - Tests for research/analysis pattern detection
  - Tests for trend/visualization pattern detection
  - Tests for case insensitivity
  - Tests for skill availability check

- [ ] **Suite: getSkillFollowUpPrompts()**
  - Tests for xlsx follow-ups
  - Tests for pdf follow-ups
  - Tests for summarize follow-ups
  - Tests for unknown skill handling

### prompt-factory.test.ts Additional Tests

- [ ] **Suite: Skill-aware generateSuggestedPrompts()**
  - Tests for skill blending with base prompts
  - Tests for response content analysis integration
  - Tests for skill follow-up priority
  - Tests for backwards compatibility

---

## Testing Standards Compliance

Per `project-context.md`:
- [x] Co-located tests: `*.test.ts` alongside source files
- [x] Use Vitest test framework
- [x] Mock skill registry for unit tests
- [x] Test max 4 prompt limit in all scenarios
- [x] Follow naming conventions: `kebab-case.test.ts`

---

## Coverage Requirements Summary

| Acceptance Criterion | Happy Path | Edge Cases | Error Handling | Boundary |
|---------------------|------------|------------|----------------|----------|
| AC1: Skill Hints | 2 | 3 | 1 | - |
| AC2: Export Prompts | 3 | 4 | - | 1 |
| AC3: Research Outputs | 2 | 2 | - | - |
| AC4: Skills API Metadata | 2 | 2 | - | 1 |
| AC5: Skill Follow-Ups | 4 | 3 | - | 2 |
| AC6: Max 4 Prompts | 2 | 2 | - | 2 |
| Integration | 5 | - | - | - |
| **Total** | **20** | **16** | **1** | **6** |

**Total Test Scenarios: 43**
