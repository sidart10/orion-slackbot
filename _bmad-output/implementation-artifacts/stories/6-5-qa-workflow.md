# Story 6.5: Q&A Workflow

Status: ready-for-dev

## Story

As a **user**, I want to ask questions and get complete, verified answers, So that I can find information reliably.

## Acceptance Criteria

1. **Given** I ask a question, **When** Orion processes the Q&A workflow (FR43), **Then** relevant sources are searched first
2. The answer is grounded in found information
3. Sources are cited in the response
4. The answer is verified before delivery
5. Follow-up questions are supported in the thread
6. Unsure answers are flagged as such

## Tasks / Subtasks

- [ ] **Task 1: Search Sources First** (AC: #1) - Search before answering
- [ ] **Task 2: Ground in Sources** (AC: #2) - Base answer on findings
- [ ] **Task 3: Cite Sources** (AC: #3) - Include citations
- [ ] **Task 4: Verify Answer** (AC: #4) - Run through verification
- [ ] **Task 5: Support Follow-ups** (AC: #5) - Maintain context
- [ ] **Task 6: Flag Uncertainty** (AC: #6) - Note when unsure

## Dev Notes

This workflow ties together all Q&A capabilities into a unified experience.

### File List

Files to create: `src/workflows/qa.ts`

