# Story 8.1: Prospect Research Capability

Status: ready-for-dev

## Story

As a **sales user**, I want Orion to research prospects, So that I'm prepared for sales calls.

## Acceptance Criteria

1. **Given** I provide a prospect name and company, **When** I request a prospect brief, **Then** Orion researches the prospect via web search
2. Company news and recent developments are gathered
3. LinkedIn insights are retrieved when available
4. Industry trends relevant to the prospect are analyzed
5. Research is parallelized for speed

## Tasks / Subtasks

- [ ] **Task 1: Parse Prospect Request** (AC: #1) - Extract name, company
- [ ] **Task 2: Web Search** (AC: #1, #2) - Company news, developments
- [ ] **Task 3: LinkedIn Insights** (AC: #3) - Via web search or tool
- [ ] **Task 4: Industry Analysis** (AC: #4) - Relevant trends
- [ ] **Task 5: Parallelize Research** (AC: #5) - Use subagents
- [ ] **Task 6: Verification** - Test with sample prospects

## Dev Notes

### Research Flow

```
User: "Research Jane Smith at Acme Corp for my call tomorrow"
    │
    ▼
[Parse: Jane Smith, Acme Corp]
    │
    ├── [Subagent: Company News]
    ├── [Subagent: LinkedIn/Professional]
    └── [Subagent: Industry Trends]
    │
    ▼
[Synthesize into Dossier]
```

### File List

Files to create: `src/workflows/prospect-research.ts`

