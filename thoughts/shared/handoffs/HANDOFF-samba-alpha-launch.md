---
root_span_id: f19b47a1-d197-4471-b4a7-e72360dd4238
turn_span_id: 
session_id: f19b47a1-d197-4471-b4a7-e72360dd4238
---

# Handoff: Samba Alpha Launch (2-Day Sprint)

**Created:** 2026-02-08
**From:** Desktop session (research + planning)
**To:** Work laptop session (implementation)
**Priority:** HIGH — Alpha launch target in 2 days

---

## Context

All 8 MVP epics are COMPLETE. The agent works. But the system prompt is too thin for alpha launch and key context/branding docs are missing.

This session conducted deep research into:
1. Current system prompt state (105 lines, skeleton-level)
2. GCS bucket contents (memory only, no reference docs)
3. Full tool/skill inventory (8 MCP servers, 14 skills, 3 core tools)
4. Samba TV branding system ("Technical Warmth", Acid Green, Season Mix fonts)
5. Claude Code system prompt patterns (progressive disclosure, 269-token core)
6. All pending work across all plan files

## What Needs To Happen

### Day 1: System Prompt + Branding (HIGHEST IMPACT)

**Rewrite `.orion/agents/orion.md`** with substance:

1. **Company Context** — Expand from 2 lines to real content:
   - Samba TV products: audience measurement, cross-screen targeting, attribution
   - Key data: TV viewership, demographics, media analytics
   - Brand identity: "Technical Warmth" — data intelligence meets human narrative

2. **Tool Inventory** — Agent needs to know what it has:
   - `audience-manager` — TV viewership data, sports audiences, demographics
   - `msci-reports` — Data reports, analytics dashboards, BI
   - `exa` — Web search and research
   - `rube` — 500+ app integrations (GitHub, Slack, Notion, Google, etc.)
   - `genmedia-imagen` — Image generation (Imagen 4 Ultra)
   - `genmedia-veo` — Video generation (Veo 3.1 with audio)
   - `memory` — Persistent storage across sessions
   - `code_execution` — Python/Bash sandboxed execution

3. **Branding Rules for Media Generation** — CRITICAL GAP:
   - samba-slides enforces branding, but Imagen/Veo have ZERO brand enforcement
   - Brand colors: Void Black `#050505`, Stark White `#FFFFFF`, Acid Green `#CCFF00`
   - Typography: Season Mix (headlines), Season Sans (body)
   - Design philosophy: "Add data/tek to imagery" — HUD overlays, negative space
   - Logo: `samba-logo-white.png` (dark bg), `samba-logo-black.png` (light bg)
   - Rule: When generating images FOR Samba/branded content, apply brand guidelines

4. **Skill Triggers** — Improve current table with better guidance:
   - samba-slides: MUST run wizard protocol, has full brand enforcement
   - pdf/xlsx/docx: Document handling skills
   - summarize: Context-aware (thread/channel/DM detection)
   - d3js-visualization: Interactive charts
   - algorithmic-art: Currently uses WRONG branding (Anthropic) — needs fix

5. **Behavioral Rules** — What Claude Code does well:
   - Constraint-first design (NEVER/ALWAYS rules)
   - Tool preference hierarchy
   - Graceful failure patterns

### Day 2: GCS Context Docs + Testing

1. **Create `company-context.md`** for GCS bucket (`gs://orion-memories/`):
   - Samba TV overview, products, departments
   - Brand guidelines reference
   - Key terminology

2. **Create `tool-inventory.md`** for GCS:
   - Auto-generated from `.orion/config.yaml`
   - Tool descriptions, capabilities, example queries

3. **Manual Testing**:
   - "Get NFL audience data" → uses tool_search, finds audience-manager
   - "Create a presentation" → triggers samba-slides wizard
   - "Generate an image for our next campaign" → applies brand guidelines
   - "What tools do you have?" → agent can describe its capabilities
   - "Summarize this channel" → triggers summarize skill

## Research Artifacts (from this session)

All in `.claude/cache/agents/scout/`:
- `output-gcs-investigation-20260208-141607.md` — GCS bucket analysis
- `output-20260208-141719.md` — Pending work inventory
- `output-20260208-143243.md` — Claude Code prompt patterns analysis
- `output-samba-branding-20260208.md` — Samba branding deep dive

## Key Files

| File | Purpose |
|------|---------|
| `.orion/agents/orion.md` | System prompt (REWRITE THIS) |
| `.orion/agents/orion.md.backup-20260202` | Backup of previous version |
| `.orion/config.yaml` | MCP server definitions |
| `.skills/samba-slides/SKILL.md` | Reference for how branding is done right |
| `.skills/samba-slides/scripts/samba_pptx.py` | Brand color/font constants |
| `thoughts/shared/plans/PLAN-samba-system-prompt.md` | Original plan (partially done) |
| `docs/samba-slackbot-manifest.yaml` | Slack app manifest |

## What's NOT in Scope for Alpha

- Progressive disclosure with 110+ files (overkill for now)
- Skills path fix (`/mnt/skills` vs `/skills/`)
- File Upload Phase 2 & 3
- Test reorganization
- Epic 7 backlog (7.7, 7.8, 7.9)
- Full GCS retrieval layer (just seed the docs manually)

## Resume Instructions

```
cd /Users/sid/Desktop/samba-agentic-slackbot
# Read this handoff
# Read the current system prompt: .orion/agents/orion.md
# Read branding reference: .skills/samba-slides/SKILL.md (first 100 lines for brand system)
# Read scout reports in .claude/cache/agents/scout/ for full research
# Start with Day 1: System prompt rewrite
```
