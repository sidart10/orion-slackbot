# Samba TV Branding Report
Generated: 2026-02-08

## Executive Summary

Samba TV has **comprehensive branding guidelines** implemented specifically for PowerPoint generation, but **NO branding enforcement** for AI-generated images (Imagen) or videos (Veo). The codebase contains detailed brand identity documentation, logos, and a sophisticated slide generation system, but image/video generation tools operate without brand constraints.

---

## Samba TV Identity

### Company Context

**Name:** Samba TV  
**Description:** TV data and analytics company specializing in audience measurement, cross-screen targeting, and attribution  
**Core Expertise:** TV viewership data, demographics, and media analytics

**Source:** `.orion/agents/orion.md` (lines 9-11)

---

## Brand Design System: "Technical Warmth"

### Brand Essence

**Core Philosophy:** "Technical Warmth"  
> "Samba's visual identity exists at the intersection of rigorous, high-precision data intelligence and organic, human narrative. It is where the 'synthetic' (AI, code, structure) meets the 'natural' (lifestyle, warmth, culture)."

**Mantra:** "Add data/tek to imagery"  
> "We do not just show data; we show how data *sees* the world. We layer intelligence over reality."

**Source:** `.skills/samba-slides/references/brand-guidelines.md`

---

## Color Palette

### Primary Backgrounds (The Canvas)

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Void Black** | `#050505` | Dark background - deep, infinite space for data to glow |
| **Stark White** | `#FFFFFF` | Light background - clean, editorial space for clarity |

**Theme Transitions:** Seamless shifts between Black and White signal a move from "Concept/Theory" (White) to "Deep Tech/Execution" (Black)

### Accent Colors (The Signal)

| Color | Hex Code | Role |
|-------|----------|------|
| **Acid Green** | `#CCFF00` | Active state - cursors, highlight text, primary buttons, live data spikes |
| **Signal Red/Orange** | (varies) | Alert states or human warmth accents in photography |

**CRITICAL:** Acid Green (`#CCFF00`) is the primary accent - NOT orange.

---

## Typography

### Primary Typeface: Season Family

| Font | Role | Usage |
|------|------|-------|
| **Season Mix** (Serif/Display) | The "Voice" | Headlines, hero statements, emotional hooks |
| **Season Sans** | The "Brain" | UI elements, data viz, body copy, technical labeling |
| **Consolas** (fallback) | HUD labels | Technical overlays, micro-typography |

**Typography Principles:**
- **Extreme Hierarchy:** Massive Season Mix headlines paired with tiny Season Sans technical labels
- **Micro-Labels:** Text as texture - small caps, coordinates (`X: 1040 Y: 447`), timestamps (`15:07:45`)
- **HUD Overlay:** Mimics a machine's Heads-Up Display

**Font Locations:**
- `/Users/sid/Desktop/samba-agentic-slackbot/.skills/samba-slides/assets/fonts/*.ttf`

---

## Graphic Elements

### The "Data/Tek" Layer (AI Logic)

- **Wireframes:** Thin white lines (0.5pt-1pt) depicting 3D structures (globes, cubes, UI skeletons)
- **Knowledge Graph:** Nodes and edges connecting disjointed images or concepts
- **HUD Overlays:**
  - Bounding boxes around objects in photos
  - Tracking dots on key features
  - Terminal code blocks floating in space
  - Coordinate labels and timestamps

### The "Human" Layer

- **Cinematic Photography:** Candid, lifestyle imagery with warm lighting (avoid stock looks)
- **Rolling Cards:** Images as decks or carousels (Apple Cover Flow style, 3D spiraling cards)
- **2.5D Depth:** Images float, tilt, or overlap to create deep space (rarely flat)

---

## Layout Principles

1. **Space to Breathe:** 40-50% of canvas should be negative space
2. **Grid Alignment:** Rigid alignment for text/UI elements (software feel)
3. **Split Compositions:** 50/50 - Left for Typography (Story), Right for Visuals (Evidence)
4. **Containerization:** Rounded-corner cards (radius 8px-12px) for disparate content types

---

## Logo Assets

### Available Logos

**Location:** `.skills/samba-slides/assets/logos/`

| File | Theme | Status |
|------|-------|--------|
| `samba-logo-white.png` | Dark backgrounds | ✓ Available |
| `samba-logo-black.png` | Light backgrounds | ✓ Available |
| `samba-logo-tagline-white.png` | External/Marketing (dark) | ✗ Pending |
| `samba-logo-tagline-black.png` | External/Marketing (light) | ✗ Pending |
| `samba-logo-full-white.png` | Investor/Formal (dark) | ✗ Pending |
| `samba-logo-full-black.png` | Investor/Formal (light) | ✗ Pending |
| `samba-logo-badge-white.png` | Partner/Co-branded (dark) | ✗ Pending |
| `samba-logo-badge-black.png` | Partner/Co-branded (light) | ✗ Pending |

**Logo Variants:**

| Variant | Description | Best For | Status |
|---------|-------------|----------|--------|
| **Standard** | Simple logo mark, no tagline | Internal, default | Available |
| **With Tagline** | Logo + tagline beneath | External, marketing | Pending |
| **Full Lockup** | Complete brand lockup | Investor, formal, board | Pending |
| **Badge** | Compact icon version | Partner, co-branded | Pending |

### Context-Based Logo Placement

**Auto-Branding Configuration:**

| Context | Title Slide Logo | End Slide Logo |
|---------|------------------|----------------|
| **Internal** | Bottom-right (small) | Center (large) |
| **External** | Bottom-right (medium) | Center (large) |
| **Investor** | Bottom-right (medium) | Center (large) |
| **Partner** | None (co-branding space) | Center (large) |

**Source:** `.skills/samba-slides/assets/logos/logo-manifest.yaml`

---

## Implemented Branding: PowerPoint Generation

### Skill: samba-slides

**Location:** `.skills/samba-slides/SKILL.md` (666 lines)  
**Version:** 5.1-hybrid (verified 2026-01-11)

**Status:** ✓ FULLY IMPLEMENTED with mandatory brand compliance

### Brand Enforcement

The `samba-slides` skill enforces Samba branding through:

1. **Wizard Protocol (MANDATORY):** Before generating slides, agent MUST ask:
   - Presentation type (internal/external/investor/partner)
   - Theme (dark/light)
   - Slide count
   - Content per section
   - Logo preference

2. **SambaPresentation Module:** Python module (`samba_pptx.py`) that:
   - Enforces brand colors (Void Black `#050505`, Stark White `#FFFFFF`, Acid Green `#CCFF00`)
   - Uses Season Mix/Sans fonts (with fallback to system fonts if not installed)
   - Auto-applies logos based on context
   - Provides HUD overlay methods (`add_hud_coordinates()`, `add_tracking_dot()`, `add_bounding_box()`)

3. **Brand Checklist (6 items):**
   - [ ] Font correct? (Season Mix/Sans)
   - [ ] "Tek on Img"? (HUD overlays on images)
   - [ ] Clean? (40-50% negative space)
   - [ ] Accent? (Touch of Acid Green)
   - [ ] Logo placed? (End slide minimum)
   - [ ] Speaker notes? (Talking points added)

**Critical Rule:** Agents CANNOT skip the wizard protocol when generating presentations.

---

## NOT Implemented: Image & Video Generation Branding

### Imagen (Image Generation)

**Tool:** `genmedia-imagen` (Google Vertex AI - Imagen 4 Ultra)  
**Configuration:** `.orion/config.yaml` lines 60-73  
**MCP Server:** `https://mcp-imagen-201626763325.us-central1.run.app/mcp`

**Branding Status:** ✗ NO BRANDING ENFORCEMENT

**Current Behavior:**
- Agent can call Imagen to generate images
- No brand color constraints
- No logo overlay
- No "Technical Warmth" design philosophy applied
- No HUD overlays or data layers

**Gap:** Images generated via Imagen do NOT automatically include:
- Samba logos
- Brand color palette
- "Tek on Img" overlays
- Typography system

### Veo (Video Generation)

**Tool:** `genmedia-veo` (Google Vertex AI - Veo 3.1)  
**Configuration:** `.orion/config.yaml` lines 75-90  
**MCP Server:** `https://mcp-veo-201626763325.us-central1.run.app/mcp`

**Branding Status:** ✗ NO BRANDING ENFORCEMENT

**Current Behavior:**
- Agent can call Veo to generate videos
- No brand guidelines applied to video generation
- No logo watermarking
- No brand color constraints

---

## Other Image Generation: Algorithmic Art

### Skill: algorithmic-art

**Location:** `.skills/algorithmic-art/SKILL.md` (405 lines)  
**Purpose:** Generative art using p5.js

**Branding Status:** ✗ Uses **Anthropic branding**, NOT Samba branding

**Current Implementation:**
- Uses Anthropic colors, fonts, gradients
- Template file: `templates/viewer.html` (Anthropic branded)
- Font: Poppins/Lora (Anthropic), NOT Season Mix/Sans (Samba)
- Color scheme: Light colors, gradient backdrop (Anthropic)

**Gap:** Algorithmic art skill does NOT use Samba brand identity.

---

## Slack Bot Branding

### Slack Manifest

**File:** `docs/samba-slackbot-manifest.yaml`

**Branding Elements:**
- **Display Name:** "Samba"
- **Description:** "ai assistant" (lowercase intentional)
- **Background Color:** `#000000` (black - aligns with Void Black)
- **Long Description:** "Samba is your AI assistant for Samba Employees. Ask questions, research topics, summarize threads, and more."
- **Bot Display Name:** "samba" (lowercase)

**Status:** ✓ Implemented in Slack workspace

---

## GCS Memory - Company Context

### Planned but NOT Implemented

**Source:** `thoughts/shared/plans/PLAN-samba-system-prompt.md` lines 231-253

**Reference Documents (PLANNED, NOT CREATED):**

| Document | Content | Update Frequency | Status |
|----------|---------|------------------|--------|
| `company-context.md` | Samba TV products, org structure | Quarterly | ✗ Not created |
| `department-workflows.md` | HR, Sales, Marketing tool mappings | As needed | ✗ Not created |
| `tool-inventory.md` | Auto-generated from config.yaml | On deploy | ✗ Not created |

**Storage Location (if implemented):** `gs://orion-memories/reference/`

**Current Status:**
- GCS memory bucket exists (`gs://orion-memories/`)
- Memory Tool implemented for agent-created files
- Reference documents are **planned but not implemented**
- No loader exists to inject company context

**Evidence:**
```bash
find . -name "company-context.md"      # Not found
find . -name "department-workflows.md" # Not found
find . -name "tool-inventory.md"       # Not found
```

---

## Brand Compliance Matrix

| Use Case | Branding Status | Enforcement | Gap |
|----------|----------------|-------------|-----|
| **PowerPoint Generation** | ✓ Full compliance | Mandatory wizard protocol | None |
| **Image Generation (Imagen)** | ✗ No branding | None | No logo, colors, or HUD overlays |
| **Video Generation (Veo)** | ✗ No branding | None | No watermark or brand elements |
| **Algorithmic Art** | ✗ Anthropic branding | Fixed template | Wrong brand identity |
| **Slack Bot UI** | ✓ Partial compliance | Manifest config | Background color only |
| **Company Context Docs** | ✗ Not implemented | N/A | Documents don't exist |

---

## Recommendations

### High Priority

1. **Imagen Branding Enforcement:**
   - Add prompt suffix to include Samba brand elements
   - Consider post-generation logo overlay (composite image with logo)
   - Inject brand color palette into generation prompts

2. **Veo Branding Enforcement:**
   - Add logo watermark to generated videos
   - Include brand colors in video generation prompts

3. **Create Company Context Documents:**
   - Write `company-context.md` (Samba TV products, teams)
   - Write `department-workflows.md` (tool mappings)
   - Generate `tool-inventory.md` from `.orion/config.yaml`
   - Upload to `gs://orion-memories/reference/`

### Medium Priority

4. **Algorithmic Art Rebranding:**
   - Create Samba-branded template replacing Anthropic template
   - Use Season fonts instead of Poppins/Lora
   - Apply Void Black/Stark White/Acid Green color scheme

5. **Missing Logo Variants:**
   - Create tagline variants for external/marketing use
   - Create full lockup for investor decks
   - Create badge variant for partner materials

### Low Priority

6. **Update .env.example:**
   - Add `GCS_MEMORIES_BUCKET=orion-memories` (currently missing)

---

## Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `.skills/samba-slides/references/brand-guidelines.md` | Complete brand identity guide | ✓ Exists |
| `.skills/samba-slides/assets/logos/logo-manifest.yaml` | Logo variant configuration | ✓ Exists |
| `.skills/samba-slides/assets/logos/samba-logo-white.png` | Logo for dark backgrounds | ✓ Exists |
| `.skills/samba-slides/assets/logos/samba-logo-black.png` | Logo for light backgrounds | ✓ Exists |
| `.skills/samba-slides/SKILL.md` | PowerPoint generation skill | ✓ Exists |
| `.skills/samba-slides/scripts/samba_pptx.py` | Brand-compliant Python module | ✓ Exists |
| `.orion/agents/orion.md` | Samba agent system prompt | ✓ Exists |
| `.orion/config.yaml` | MCP tool configuration | ✓ Exists |
| `docs/samba-slackbot-manifest.yaml` | Slack app configuration | ✓ Exists |
| `gs://orion-memories/reference/company-context.md` | Company context (planned) | ✗ Not created |

---

## Architecture: Progressive Disclosure

Samba uses a **progressive disclosure** architecture:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Core Prompt (~100 lines)                      │
│  - Identity, 5 principles, tool-search rule, Slack fmt  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Skills (self-contained)                       │
│  - samba-slides: 666 line wizard protocol + branding    │
│  - pdf/xlsx/docx: extraction guidance                   │
│  - summarize: thread/channel detection                  │
│  - algorithmic-art: generative art (Anthropic branding) │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 3: GCS Documents (PLANNED, NOT IMPLEMENTED)      │
│  - company-context.md                                   │
│  - department-workflows.md                              │
│  - tool-inventory.md (auto-generated)                   │
└─────────────────────────────────────────────────────────┘
```

**Status:** Layers 1 and 2 implemented, Layer 3 planned only.

---

## Summary

**What Exists:**
- ✓ Comprehensive "Technical Warmth" brand guidelines
- ✓ Complete color palette (Void Black, Stark White, Acid Green)
- ✓ Typography system (Season Mix/Sans)
- ✓ Logo assets (standard variants for dark/light)
- ✓ PowerPoint generation with MANDATORY brand enforcement
- ✓ Slack bot with basic branding (name, background color)

**What's Missing:**
- ✗ Image generation (Imagen) branding enforcement
- ✗ Video generation (Veo) branding enforcement
- ✗ Samba-branded algorithmic art templates
- ✗ Additional logo variants (tagline, full lockup, badge)
- ✗ Company context documents in GCS

**Critical Insight:**
Samba has invested heavily in branded PowerPoint generation with a sophisticated wizard protocol and brand checklist, but AI-generated images and videos currently have NO branding constraints. This creates a **brand consistency gap** between presentation outputs (fully branded) and media generation outputs (unbranded).
