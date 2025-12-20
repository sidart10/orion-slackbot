# Story 2.9: Basic Q&A with Knowledge Search

Status: done

## Story

As a **user**,
I want to ask questions and get grounded answers,
So that I can find information quickly.

## Acceptance Criteria

1. **Given** the agent loop and memory are working, **When** I ask a question, **Then** Orion searches relevant knowledge sources before answering (FR31)

2. **Given** knowledge is found, **When** the answer is generated, **Then** the answer is grounded in found information

3. **Given** sources are used, **When** the response is formatted, **Then** sources are cited in the response

4. **Given** no relevant information is found, **When** the response is generated, **Then** Orion says so rather than guessing

5. **Given** an answer is generated, **When** verification runs, **Then** the response is verified before delivery (FR30)

## Tasks / Subtasks

- [x] **Task 1: Enhance Gather Phase for Q&A** (AC: #1)
  - [x] Update `gatherContext()` for knowledge search
  - [x] Search orion-context/knowledge/
  - [x] Search thread history for relevant context
  - [x] Prioritize authoritative sources

- [x] **Task 2: Implement Knowledge-Grounded Response** (AC: #2)
  - [x] Include found knowledge in prompt
  - [x] Instruct model to use sources
  - [x] Avoid hallucination

- [x] **Task 3: Add Source Citations** (AC: #3)
  - [x] Track sources during response generation
  - [x] Format citations for Slack
  - [x] Include source links

- [x] **Task 4: Handle No Information Found** (AC: #4)
  - [x] Detect when no relevant sources found
  - [x] Generate honest "I don't know" response
  - [x] Suggest alternative actions

- [x] **Task 5: Integrate with Verification** (AC: #5)
  - [x] Verify claims are grounded in sources
  - [x] Flag speculative statements
  - [x] Ensure citation presence

- [x] **Task 6: Verification** (AC: all)
  - [x] Ask question with known answer in knowledge
  - [x] Verify answer is grounded and cited
  - [x] Ask question with no known answer
  - [x] Verify honest "don't know" response

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR30 | prd.md | Verified Q&A with knowledge search |
| FR31 | prd.md | Knowledge search before answering |

### Q&A Flow

```
User Question
    │
    ▼
┌─────────────────────┐
│  GATHER: Search     │
│  - orion-context/   │
│  - Thread history   │
│  - Knowledge base   │
└─────────┬───────────┘
          │
          ▼
    ┌─────────────────┐
    │ Found sources?  │
    └───────┬─────────┘
        │       │
       Yes      No
        │       │
        ▼       ▼
   [Generate    [Generate
    grounded    "I don't know"
    answer]     response]
        │       │
        ▼       ▼
┌─────────────────────┐
│  VERIFY: Check      │
│  - Grounded claims  │
│  - Citations        │
│  - No speculation   │
└─────────────────────┘
```

### Honest "Don't Know" Response

```typescript
function generateNoInformationResponse(question: string): string {
  return `I couldn't find specific information about that in my knowledge sources.\n\n` +
    `*What I can do:*\n` +
    `• Search Slack history for related discussions\n` +
    `• Search Confluence for documentation\n` +
    `• Help you ask a colleague who might know\n\n` +
    `Would you like me to try one of these?`;
}
```

### References

- [Source: _bmad-output/epics.md#Story 2.9] — Original story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

- This story ties together memory, verification, and citations
- Honesty about knowledge gaps builds user trust
- Consider adding suggested prompts for common Q&A topics
- Implemented knowledge search in gather phase with prioritization
- Added context-aware system prompts for grounded responses
- Enhanced verification rules check for citations and factual claims
- Comprehensive integration tests verify all 5 acceptance criteria

### Implementation Summary

**Task 1: Enhance Gather Phase for Q&A**
- Added `searchKnowledge()` import and call in `gatherContext()`
- Added `KnowledgeContext` interface and `knowledgeContext` field to `GatheredContext`
- Knowledge sources prioritized via `relevantSources.unshift()`
- Added `knowledgeContextCount` to logging and span outputs

**Task 2: Implement Knowledge-Grounded Response**
- Updated `buildContextString()` to include Knowledge Base section
- Added grounding instructions: "Base your answer on this information and cite sources"
- Knowledge sources formatted with numbered references [1], [2], etc.

**Task 3: Add Source Citations**
- Already implemented in Story 2.7 via `formatCitationFooter()` in `orion.ts`
- Citations automatically appended when sources are present

**Task 4: Handle No Information Found**
- Enhanced `generateResponseContent()` with context-aware system prompts
- When no sources found: instructs model to be honest, not speculate
- Suggests alternative ways to find information

**Task 5: Integrate with Verification**
- `cites_sources` rule verifies citation presence
- `factual_claim_check` rule flags unsupported claims
- Both rules are warning-severity (don't block response but flag issues)

**Task 6: Verification Tests**
- Added 5 integration tests verifying each AC
- All 597 tests pass (11 new tests added for Story 2.9)

### File List

Files modified:
- `src/agent/loop.ts` - Enhanced gather phase, knowledge grounding, honesty prompts
- `src/agent/loop.test.ts` - Added 11 tests for Story 2.9 including priority and alternative suggestions tests
- `src/memory/knowledge.ts` - Added relevance threshold (30%) and result limit (5) to searchKnowledge()

Files referenced (no changes needed):
- `src/agent/citations.ts` - Used citation formatting (Story 2.7)
- `src/agent/orion.ts` - Citation footer already implemented

### Change Log

- 2025-12-18: Story 2.9 implementation complete - All 6 tasks done, 587 tests passing
- 2025-12-18: Code review fixes applied:
  - Fixed test mock hoisting issue (mockMarkServerUnavailable)
  - Added MIN_RELEVANCE_THRESHOLD (30%) to searchKnowledge() to prevent low-relevance results
  - Added MAX_KNOWLEDGE_RESULTS (5) to limit context flooding
  - Added test for alternative suggestions when no info found (AC#4)
  - Added test for knowledge source priority verification (Task 1)
  - All 597 tests pass

