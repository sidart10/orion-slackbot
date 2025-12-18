# Story 5.8: Source Linking

Status: ready-for-dev

## Story

As a **user**,
I want links to all source materials,
So that I can verify and explore further.

## Acceptance Criteria

1. **Given** research results are synthesized, **When** the response is delivered, **Then** links to source materials are included (FR9)
2. **Given** links are included, **When** displayed in Slack, **Then** links are formatted for Slack (clickable)
3. **Given** multiple source types, **When** organizing results, **Then** sources are organized by type (Slack, Confluence, web)
4. **Given** links are included, **When** possible, **Then** links are verified as accessible when possible
5. **Given** some sources missing, **When** formatting output, **Then** missing sources are noted

## Tasks / Subtasks

- [ ] **Task 1: Collect Source Links** (AC: #1)
  - [ ] Track all sources
  - [ ] Extract URLs
  - [ ] Associate with findings

- [ ] **Task 2: Format for Slack** (AC: #2)
  - [ ] Use Slack link syntax
  - [ ] Make clickable
  - [ ] Include titles

- [ ] **Task 3: Organize by Type** (AC: #3)
  - [ ] Group sources
  - [ ] Label types
  - [ ] Order by relevance

- [ ] **Task 4: Verify Links** (AC: #4)
  - [ ] Check accessibility
  - [ ] Note broken links
  - [ ] Skip slow checks

- [ ] **Task 5: Note Missing** (AC: #5)
  - [ ] Detect gaps
  - [ ] Note in output

## Dev Notes

### Source Formatting

```typescript
function formatSourcesForSlack(sources: Source[]): string {
  const grouped = groupBy(sources, s => s.type);
  
  return Object.entries(grouped)
    .map(([type, items]) => {
      const links = items.map(s => `• <${s.url}|${s.title}>`).join('\n');
      return `*${type}:*\n${links}`;
    })
    .join('\n\n');
}
```

### File List

Files to modify:
- `src/agent/citations.ts`
- `src/agent/synthesis.ts`

