# Story 2.9: Basic Q&A with Knowledge Search

Status: ready-for-dev

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

- [ ] **Task 1: Enhance Gather Phase for Q&A** (AC: #1)
  - [ ] Update `gatherContext()` for knowledge search
  - [ ] Search orion-context/knowledge/
  - [ ] Search thread history for relevant context
  - [ ] Prioritize authoritative sources

- [ ] **Task 2: Implement Knowledge-Grounded Response** (AC: #2)
  - [ ] Include found knowledge in prompt
  - [ ] Instruct model to use sources
  - [ ] Avoid hallucination

- [ ] **Task 3: Add Source Citations** (AC: #3)
  - [ ] Track sources during response generation
  - [ ] Format citations for Slack
  - [ ] Include source links

- [ ] **Task 4: Handle No Information Found** (AC: #4)
  - [ ] Detect when no relevant sources found
  - [ ] Generate honest "I don't know" response
  - [ ] Suggest alternative actions

- [ ] **Task 5: Integrate with Verification** (AC: #5)
  - [ ] Verify claims are grounded in sources
  - [ ] Flag speculative statements
  - [ ] Ensure citation presence

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Ask question with known answer in knowledge
  - [ ] Verify answer is grounded and cited
  - [ ] Ask question with no known answer
  - [ ] Verify honest "don't know" response

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

{{agent_model_name_version}}

### Completion Notes List

- This story ties together memory, verification, and citations
- Honesty about knowledge gaps builds user trust
- Consider adding suggested prompts for common Q&A topics

### File List

Files to modify:
- `src/agent/loop.ts` (enhance gather for Q&A)
- `src/agent/orion.ts` (Q&A-specific prompting)

