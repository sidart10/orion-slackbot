# Story 8.2: Structured Prospect Dossiers

Status: ready-for-dev

## Story

As a **sales user**, I want prospect research in a structured dossier format, So that I can quickly scan and use the information.

## Acceptance Criteria

1. **Given** prospect research is complete, **When** Orion delivers the results, **Then** a structured dossier is provided (FR32)
2. The dossier includes: company overview, recent news, likely priorities, connections to existing clients
3. Actionable conversation hooks are highlighted
4. Sources are cited with links
5. The format is consistent and scannable

## Tasks / Subtasks

- [ ] **Task 1: Define Dossier Template** (AC: #2, #5) - Consistent structure
- [ ] **Task 2: Company Overview Section** (AC: #2) - Background info
- [ ] **Task 3: Recent News Section** (AC: #2) - Latest developments
- [ ] **Task 4: Conversation Hooks** (AC: #3) - Actionable insights
- [ ] **Task 5: Source Citations** (AC: #4) - Links to sources
- [ ] **Task 6: Verification** - Test dossier format

## Dev Notes

### Dossier Template

```
*Prospect Dossier: Jane Smith, Acme Corp*

*Company Overview*
• Industry: [industry]
• Size: [size]
• Recent funding/events: [details]

*Recent News*
• [News item 1] - [date]
• [News item 2] - [date]

*Likely Priorities*
• [Priority 1]
• [Priority 2]

*Conversation Hooks*
→ [Hook 1]: Why this matters
→ [Hook 2]: How to bring it up

*Sources:*
• <url|title>
```

### File List

Files to modify: `src/workflows/prospect-research.ts`

