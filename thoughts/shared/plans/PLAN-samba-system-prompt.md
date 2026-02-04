# Plan: Samba System Prompt Rewrite

## Goal

Rewrite the Orion system prompt (`.orion/agents/orion.md`) to be Samba-specific using **progressive disclosure architecture** inspired by Claude Code's prompt design.

**Current state:** Generic 123-line prompt with basic tool search guidance
**Target state:** Lean ~100-line core prompt + skills handle complexity + GCS for reference docs

**Key Constraint:** Do NOT rename the file. Update content in-place, changing "Orion" to "Samba".

## Architecture Decision

### Why Progressive Disclosure?

Research into Anthropic's prompt patterns revealed:

| Source | Core Prompt Size | Pattern |
|--------|-----------------|---------|
| **Claude Code** | 269 tokens | Conditional loading, 110+ separate prompts |
| **Claude.ai** | Modular sections | Delegates to docs, epistemic boundaries |
| **Original Plan** | ~3,880 tokens | Monolithic, everything inline |
| **Revised Plan** | ~1,200 tokens | **Progressive disclosure** |

**Key insight:** Claude Code's main prompt is only **269 tokens**. Complexity is handled by:
1. Tool descriptions loaded conditionally
2. Sub-agents for specialized tasks
3. External documentation references
4. System reminders injected contextually

### Samba Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Core Prompt (~100 lines)                      │
│  - Identity, 5 principles, tool-search rule, Slack fmt  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Skills (self-contained)                       │
│  - samba-slides: 600+ line wizard protocol              │
│  - pdf/xlsx/docx: extraction guidance                   │
│  - summarize: thread/channel detection                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 3: GCS Documents (future)                        │
│  - company-context.md                                   │
│  - department-workflows.md                              │
│  - tool-inventory.md (auto-generated)                   │
└─────────────────────────────────────────────────────────┘
```

## User Pain Points Addressed

| Pain Point | Priority | Solution |
|------------|----------|----------|
| Better tool guidance | **KEY** | Core prompt: tool-search-first rule |
| Department-specific workflows | High | **GCS document** (future) - not inline |
| Proactive capabilities | High | **Baked into skills** - not inline |
| Document handling | High | Skills trigger list in core prompt |

## Core Prompt Structure (~100 lines)

### Section 1: Identity & Context (~15 lines)

```markdown
---
name: samba
description: Samba - Samba TV's AI assistant for TV data and analytics
model: claude-sonnet-4-20250514
---

You are Samba, Samba TV's AI assistant integrated with Slack.

## Company Context
Samba TV: TV data and analytics company specializing in audience measurement, cross-screen targeting, and attribution. You have expertise in TV viewership data, demographics, and media analytics.
```

### Section 2: Core Principles (~10 lines)

```markdown
## Core Principles

1. **Be helpful and direct** — Clear, actionable answers
2. **Be concise** — Respect Slack's short-form nature
3. **Use Slack mrkdwn** — `*bold*` not `**bold**`, `<url|text>` not `[text](url)`
4. **Proactively suggest next steps** — Offer follow-ups after completing tasks
5. **Search before "I can't"** — ALWAYS use `tool_search_tool_bm25` before claiming lack of capability
```

### Section 3: Tool Usage (CRITICAL) (~25 lines)

```markdown
## Tool Usage

### The Golden Rule
**ALWAYS search tools before saying "I can't do X".**

You have access to: video generation (Veo), image generation (Imagen), TV/audience data, web search (Exa), 500+ app integrations (Rube/Composio). Use `tool_search_tool_bm25` to discover them.

### Execution Order
1. **FIRST** — `tool_search_tool_bm25` to discover relevant tools
2. **THEN** — Use discovered tools to fetch data
3. **ITERATE** — Multiple items = multiple tool calls (NFL AND NBA = 2 searches)
4. **LAST** — `code_execution` only for post-processing results you already have

### Anti-Patterns
| WRONG | RIGHT |
|-------|-------|
| "I can't generate videos" | Search "video" first, use `genmedia-veo` |
| Single search for "NFL and NBA" | Search NFL, THEN search NBA |
| `code_execution` to fetch data | Use specialized tools for data |
```

### Section 4: Skills (~15 lines)

```markdown
## Skills

You have specialized skills for complex tasks. When triggered, follow the skill's guidance:

| Trigger | Skill | Key Rule |
|---------|-------|----------|
| "presentation", "slides", "deck" | `samba-slides` | **MUST run wizard protocol** |
| "analyze PDF", "extract from PDF" | `pdf` | Offer specific data extraction |
| "Excel", "CSV", "spreadsheet" | `xlsx` | Offer analysis options |
| "summarize", "catch me up" | `summarize` | Detect thread/channel context |
| "chart", "visualization" | `d3js-visualization` | For interactive charts |

Skills contain their own detailed instructions. Trust and follow them.
```

### Section 5: Slack Formatting (~15 lines)

```markdown
## Slack mrkdwn (NOT Markdown)

| Element | Slack | NOT This |
|---------|-------|----------|
| Bold | `*bold*` | ~~`**bold**`~~ |
| Italic | `_italic_` | ~~`*italic*`~~ |
| Link | `<https://url\|text>` | ~~`[text](url)`~~ |

### Response Structure
- Lead with the answer
- Use bullets for lists
- Bold key terms
- Include clickable links when citing sources
```

### Section 6: Thread Context (~10 lines)

```markdown
## Thread Context

You have access to previous messages in the thread. Use them naturally:
- Reference prior context without quoting extensively
- Never hallucinate prior statements
- Ask clarifying questions if context is incomplete
```

### Section 7: Constraints (~10 lines)

```markdown
## Constraints

**NEVER:**
- Say "I can't" without searching tools first
- Use `code_execution` as your first tool
- Generate presentations without running the wizard
- Output raw URLs (use Slack link format)

**ALWAYS:**
- Iterate tool calls for multi-item requests
- Offer follow-up suggestions after tasks
```

## Tasks

### Task 1: Core Prompt Rewrite

Update `.orion/agents/orion.md` with the lean structure above.

**Acceptance Criteria:**
- [ ] All "Orion" references → "Samba"
- [ ] Total length: ~100 lines (~1,200 tokens)
- [ ] Contains: identity, 5 principles, tool-search rule, skills trigger list, Slack formatting
- [ ] Does NOT contain: department workflows, detailed proactive patterns, full tool inventory

**Files:**
- `.orion/agents/orion.md`

### Task 2: Verify Skills Have Self-Contained Guidance

Confirm each triggered skill provides its own detailed instructions.

**Verification:**
- [ ] `samba-slides`: Has wizard protocol (✓ confirmed - 600+ lines)
- [ ] `pdf`: Has extraction guidance
- [ ] `xlsx`: Has analysis guidance
- [ ] `summarize`: Has context detection
- [ ] `d3js-visualization`: Has chart creation guidance

**Files:** `.skills/*/SKILL.md`

### Task 3: Backup Current Prompt

Before modifying, create backup for rollback.

**Command:**
```bash
cp .orion/agents/orion.md .orion/agents/orion.md.backup-$(date +%Y%m%d)
```

### Task 4: Test Core Behaviors

After implementation, verify:

- [ ] "Get NFL audience data" → uses tool_search, finds audience-manager
- [ ] "I can't find tools" → model searches before claiming inability
- [ ] "Create a presentation" → triggers samba-slides skill
- [ ] "Analyze this PDF" → triggers pdf skill
- [ ] "Compare X and Y" → iterates tool calls

## Future Work (Out of Scope)

### GCS Document Layer

**Purpose:** Store reference documents retrievable on-demand

| Document | Content | Update Frequency |
|----------|---------|------------------|
| `company-context.md` | Samba TV products, org structure | Quarterly |
| `department-workflows.md` | HR, Sales, Marketing tool mappings | As needed |
| `tool-inventory.md` | Auto-generated from config.yaml | On deploy |

**Retrieval mechanism:** TBD - could use a skill or inject based on user context.

### Dynamic Context Injection

**Purpose:** Inject relevant context based on conversation

- User department (from Slack profile)
- Recent tool search results
- File type detection → skill hints

## Risks

### Tigers (Verified)

| Risk | Severity | Mitigation |
|------|----------|------------|
| No rollback mechanism | MEDIUM | Task 3: Create backup before modifying |

### Paper Tigers (Verified as Non-Issues)

| Risk | Why It's OK |
|------|-------------|
| Skills count mismatch | Verified: exactly 13 skills exist |
| Tool names might change | Config-based, stable MCP server names |
| Prompt too short | Claude Code core is 269 tokens - lean is intentional |

### Elephants (Acknowledged, Deferred)

| Risk | Status |
|------|--------|
| Company context is static | Deferred to GCS layer |
| Department workflows not inline | Deferred to GCS layer |
| No A/B testing | Accept risk, use backup for rollback |

## Success Criteria

### Automated
- [ ] Prompt parses as valid YAML frontmatter + markdown
- [ ] No references to "Orion" remain
- [ ] Line count: 80-120 lines
- [ ] Token count: < 1,500 tokens

### Manual
- [ ] Tool search-first rule is prominent
- [ ] Skills trigger list is clear
- [ ] Slack formatting is correct
- [ ] No department-specific content (belongs in GCS)

## Implementation Order

1. **Task 3:** Create backup
2. **Task 1:** Rewrite core prompt
3. **Task 2:** Verify skills
4. **Task 4:** Test behaviors

## References

- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts) - 269 token core, modular architecture
- [Anthropic System Prompts](https://platform.claude.com/docs/en/release-notes/system-prompts) - Progressive disclosure pattern
- [Simon Willison Analysis](https://simonwillison.net/2025/May/25/claude-4-system-prompt/) - Prompt design insights

## Appendix: Token Comparison

| Version | Lines | Est. Tokens | Notes |
|---------|-------|-------------|-------|
| Current (Orion) | 123 | ~1,600 | Basic tool guidance |
| Original Plan | 285 | ~3,880 | Monolithic, everything inline |
| **Revised Plan** | ~100 | ~1,200 | Progressive disclosure |
| Claude Code core | ~20 | 269 | Reference point |

**Savings:** 65% reduction from original plan (3,880 → 1,200 tokens)
