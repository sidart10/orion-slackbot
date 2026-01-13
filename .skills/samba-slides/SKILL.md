---
name: samba-slides
description: Generate Samba TV branded PowerPoint presentations programmatically using python-pptx with "Technical Warmth" design philosophy.
metadata:
  version: 5.1-hybrid
  format: decision-theory-modal-logic
  verified: 2026-01-11
  verdict: PASS
---

# Option: samba-slides

Generate Samba TV branded PowerPoint presentations with context-aware branding, HUD overlays, and the "Technical Warmth" design philosophy.

---

## Quick Start (REQUIRED - Read First!)

**IMPORTANT:** You MUST use the `samba_pptx.py` module from this skill. Do NOT improvise with generic python-pptx code.

```python
import sys
import os

# Step 1: Add skill scripts to path
SKILL_PATH = '/skills/samba-slides'
sys.path.insert(0, f'{SKILL_PATH}/scripts')

# Step 2: Set assets directory for the module
os.environ['SAMBA_ASSETS_DIR'] = f'{SKILL_PATH}/assets'

# Step 3: Import the module (REQUIRED - do not write your own)
from samba_pptx import SambaPresentation

# Step 4: Create presentation with proper branding
prs = SambaPresentation(
    theme='dark',          # 'dark' (Void Black) or 'light' (Stark White)
    context='external',    # 'internal', 'external', 'investor', 'partner'
    assets_dir=f'{SKILL_PATH}/assets'  # Fonts and logos are here
)

# Step 5: Add slides using the API
prs.add_title_slide('My Title', 'Subtitle')
prs.add_section_divider('Section Name')
prs.add_metrics_slide([
    {'value': '500M+', 'label': 'Devices', 'accent': True},
    {'value': '99.9%', 'label': 'Accuracy'}
])
prs.add_end_slide()

# Step 6: Save
prs.save('/tmp/output.pptx')
```

**Brand Colors (enforced by module):**
- Background: Void Black (#050505) or Stark White (#FFFFFF)
- Accent: Acid Green (#CCFF00) - NOT orange!
- Text: Stark White on dark, Void Black on light

**Fonts (referenced by module):**
- Headlines: Season Mix
- Body: Season Sans
- HUD: Season Sans Medium (monospace-style)

**Assets Location:**
- Fonts: `/skills/samba-slides/assets/fonts/*.ttf`
- Logos: `/skills/samba-slides/assets/logos/*.png`

---

## Initiation (I)

**Trigger Conditions:**
- User says "create a presentation", "make slides", "build a deck", "PowerPoint"
- User mentions "Samba branded slides" or "Samba presentation"
- Output format is `.pptx`
- Task involves pitch decks, team updates, client materials, investor decks

**Pre-Activation Check:**
```
I(s) = true iff (
  request_contains(presentation_keywords) ∧
  output_format ∈ {pptx, slides, deck}
)
```

**Mandatory Context Questions:**
Before ANY slide generation, ASK the user:

1. **"What type of presentation is this?"**
   | Context | Description | Logo Behavior |
   |---------|-------------|---------------|
   | `internal` | Team meetings, internal updates | Small logo on title, large on end |
   | `external` | Client-facing, marketing | Medium logo on title, large on end |
   | `investor` | Board meetings, investor decks | Medium logo on title, large on end |
   | `partner` | Co-branded partner materials | Logo on end slide only |

2. **"Dark or light theme?"**
   - `dark` (default, recommended) - Void Black (#050505) background
   - `light` - Stark White (#FFFFFF) background

---

## Observation Space (Y)

**What the agent observes at each step:**

| Observable | Type | Values |
|------------|------|--------|
| `context` | enum | {internal, external, investor, partner} |
| `theme` | enum | {dark, light} |
| `slide_count` | int | 0..∞ |
| `current_slide` | Slide | python-pptx Slide object |
| `fonts_installed` | bool | Season fonts in ~/Library/Fonts/ |
| `assets_loaded` | bool | logos/fonts accessible |
| `brand_checklist` | dict | 6 items: font, tek_on_img, clean, accent, logo, notes |

**State Vector:**
```
y = (phase, theme, context, slides[], current_slide, assets_loaded, fonts_installed, checklist_status)
```

**Observability:** Fully Observable MDP
- All state accessible via `SambaPresentation` object
- No hidden variables or latent state
- Deterministic observations (not noisy)

---

## State Space (S)

| State | Description | Information Tracked |
|-------|-------------|---------------------|
| **S₀: Uninitiated** | Skill invoked, no context | None |
| **S₁: Context Gathering** | Collecting parameters | presentation_type, theme_preference |
| **S₂: Initialized** | `SambaPresentation` created | theme, context, auto_branding, fonts, assets_dir |
| **S₃: Slide Building** | Adding slides | slide_count, types, assets, groups |
| **S₄: HUD Overlay** | Adding technical overlays | slide_ref, overlay_positions, labels |
| **S₅: Finalization** | Notes, logos, checklist | speaker_notes, logo_placements, checklist_status |
| **S₆: Terminal** | Saved | output_path, success/failure |

**Transition Diagram:**
```
S₀ ──auto──> S₁ ──confirm──> S₂ ──add_slide──> S₃ ⟷ S₄
                                               ↕    ↕
                                               S₅ ──┘
                                               ↓
                                               S₆ (terminal)
```

---

## Action Space (U)

**Phase-Dependent Actions:**

| State | Available Actions |
|-------|-------------------|
| **S₀** | `ask_presentation_type()`, `ask_theme_preference()` |
| **S₁** | `set_context(ctx)`, `set_theme(t)`, `confirm_and_proceed()` |
| **S₂** | `check_fonts()`, `configure_branding()` |
| **S₃ Templates** | `add_title_slide()`, `add_section_divider()`, `add_content_slide()`, `add_metrics_slide()`, `add_two_column_slide()`, `add_agenda_slide()`, `add_table_slide()`, `add_image_slide()`, `add_quote_slide()`, `add_end_slide()` |
| **S₃ Primitives** | `add_slide()`, `add_headline()`, `add_body_text()`, `add_bullets()`, `add_metric()`, `add_rectangle()`, `add_circle()`, `add_line()`, `add_accent_bar()`, `add_image()`, `add_video()`, `set_background_image()`, `add_image_grid()`, `create_group()`, `add_to_group()`, `move_group()` |
| **S₄** | `add_hud_coordinates()`, `add_hud_timestamp()`, `add_tracking_dot()`, `add_bounding_box()`, `add_wireframe_grid()`, `add_hud_label()` |
| **S₅** | `add_slide_notes()`, `add_logo_to_slide()`, `verify_brand_checklist()` |
| **S₆** | `save(path)` |

**API Layer Selection:**
- **Templates API**: Standard decks, quick prototyping (10 slide types)
- **Primitives API**: Custom layouts, precise control (16 element methods)

---

## Policy (π)

**Deterministic State → Action Mapping:**

| State | Condition | Action |
|-------|-----------|--------|
| `S_INIT` | Skill invoked | ASK context questions |
| `S_NO_CONTEXT` | Missing type | BLOCK until specified |
| `S_NO_THEME` | Missing theme | DEFAULT to "dark" |
| `S_CONTEXT_READY` | type + theme known | CHECK fonts |
| `S_FONTS_MISSING` | Season fonts absent | AUTO-INSTALL to ~/Library/Fonts/ |
| `S_SIMPLE_REQUEST` | Standard deck | USE Templates API |
| `S_CUSTOM_REQUEST` | Custom layout | USE Primitives API |
| `S_SLIDES_BUILT` | Content ready | VERIFY brand checklist |
| `S_CHECKLIST_FAIL` | Violations found | FIX before save |
| `S_CHECKLIST_PASS` | Brand compliant | `save(path)` |

**Policy Rules:**
```python
IF user_request AND NOT context_specified:
    ask_context_questions()
IF context == "partner":
    logo_on_end_only()
IF theme is None:
    theme = "dark"  # Greedy default
IF layout_needs_custom_positioning:
    use_primitives_api()
ELSE:
    use_templates_api()
IF slide_count > 0 AND end_slide_missing:
    add_end_slide()
IF checklist_item_failed:
    fix_before_save()
```

---

## Termination (β)

**Episode Type:** Episodic task - each presentation is independent

### SUCCESS
- `.pptx` file saved successfully
- All 6 brand checklist items verified
- User receives file path

### FAILURE
- User cancels before providing context
- Critical asset missing (logos not in assets/logos/)
- python-pptx dependency not installed
- Write permission denied
- Malformed image paths

### ABORT
- User explicitly stops mid-generation
- Memory exhaustion (100+ slides with images)

---

## Q-Heuristics

**Value Guidance for Action Selection:**

### HIGH VALUE States (reach quickly)
- `S_CONTEXT_READY` with theme="dark" → Best starting point
- `S_FONTS_INSTALLED` → Ready for proper typography
- `S_CHECKLIST_PASS` → One step from success
- Post-`add_title_slide()` → Proper opening established

### LOW VALUE States (recover quickly)
- `S_NO_CONTEXT` → Blocked, cannot proceed
- `S_FONTS_MISSING` with auto_install=False → Off-brand output
- `use_fallback_fonts=True` committed → Arial path locked in

### AVOID States (negative value)
- Saving without brand checklist → Risk off-brand deliverable
- `context="partner"` with title logo → Violates rules
- Multiple `add_end_slide()` calls → Redundant
- `S_SLIDES_BUILT` with 0 slides → Useless presentation

### Reward Structure
| Action | Reward | Rationale |
|--------|--------|-----------|
| Context acquired | +1 | Enables correct branding |
| Font auto-install | +2 | Typography without user action |
| Templates API used | +1 | Efficiency |
| Checklist passes first try | +5 | No rework |
| File saved | +10 | Goal achieved |
| HUD overlay added | +2 | "Tek on Img" brand element |
| Skip context | -10 | Wrong branding applied |
| Fallback fonts | -3 | Off-brand |
| Wrong logo color | -5 | Brand violation |

---

## Constraints

### Temporal (□, ◇, U)

| Constraint | Modal Form | Plain English |
|------------|------------|---------------|
| Context before generation | □(generate → asked_context) | Always ask context first |
| Theme before slides | □(add_slide → theme_selected) | Theme determines colors |
| Fonts before render | ◇installed U first_render | Install fonts before use |
| Background before HUD | □(add_hud → background_set) | "Tek on Img" needs image |
| Group before members | □(add_to_group(g) → created_group(g)) | Create group first |

### Epistemic (K)

| Constraint | Modal Form | Why |
|------------|------------|-----|
| Know context | K(context ∈ {internal, external, investor, partner}) | Logo placement rules |
| Know theme | K(theme ∈ {dark, light}) | Color scheme |
| Know units | K(unit ∈ {ratio, inches, px}) | Coordinate interpretation |
| Know logo rule | K(theme=dark → logo=white) | Visibility |
| Know fonts | K(fonts_installed ∨ use_fallback) | Rendering mode |

### Deontic (O, F, P)

| Constraint | Modal Form | Rule |
|------------|------------|------|
| Must ask context | O(ask_context_questions) | MANDATORY |
| Must use Season Mix | O(headline → font=SeasonMix) | Brand typography |
| Must use Season Sans | O(body_text → font=SeasonSans) | Brand typography |
| Must have end logo | O(end_slide ∧ auto_branding → has_logo) | Checklist |
| Must use Consolas HUD | O(hud_label → font=Consolas) | Technical labels |
| Forbidden: wrong logo | F(theme=dark ∧ logo=black) | Invisible logo |
| Forbidden: partner title logo | F(context=partner ∧ title_slide → has_logo) | Partner rules |
| Must maintain space | O(slide → negative_space ≥ 40%) | "Space to Breathe" |
| Must include accent | O(presentation → ∃slide(has_accent_green)) | Guide the eye |
| Permitted: any units | P(unit ∈ {ratio, inches, px}) | Flexibility |

### Dynamic ([action])

| Constraint | Modal Form | Effect |
|------------|------------|--------|
| Theme sets colors | [SambaPresentation(theme=X)]current_theme=X | Inheritance |
| Title may add logo | [add_title_slide()]has_logo iff auto_branding ∧ context≠partner | Context-dependent |
| End adds logo | [add_end_slide()]has_logo iff include_logo | All contexts |
| Background enables HUD | [set_background_image()]can_add_hud | Prerequisite |
| Save finalizes | [save(path)]file_exists ∧ immutable | Terminal |

---

## Verification

### Safety Properties (□¬bad)

| Property | Formula | Status |
|----------|---------|--------|
| S1: Theme-text contrast | □(dark → white_text) ∧ □(light → black_text) | ✓ |
| S2: Logo-theme match | □(dark → white_logo) ∧ □(light → black_logo) | ✓ |
| S3: Font fallback | □(fonts_missing → fallback ∨ install) | ✓ |
| S4: Coordinate bounds | □(ratio → 0.0 ≤ x,y ≤ 1.0) | ✓ |
| S5: No orphan groups | □(shape_in_group → group_exists) | ✓ |
| S6: Context validity | □(context ∈ {internal, external, investor, partner}) | ✓ |
| S7: Color resolution | □(color_param → valid_output) | ✓ |

### Liveness Properties (◇good)

| Property | Formula | Status |
|----------|---------|--------|
| L1: Saves complete | AG(build_complete → EF(file_saved)) | ✓ |
| L2: Logo on end | AG(add_end_slide → EF(logo_visible)) | ✓ |
| L3: Fonts install | AG(auto_install → EF(fonts_present)) | ✓ |
| L4: HUD renders | AG(add_hud_* → EF(overlay_rendered)) | ✓ |
| L5: Checklist achievable | AG(skill_used → EF(checklist_satisfiable)) | ✓ |
| L6: Context asked | AG(skill_invoked → EF(context_questions_posed)) | ✓ |

### Consistency
- Theme/Logo: ✓ No contradiction
- Context/Logo: ✓ All 4 contexts defined
- API layers: ✓ Can coexist
- Coordinates: ✓ Mutually exclusive

### Completeness
- Theme × Context: 8/8 combinations ✓
- Brand checklist: 6/6 items have APIs ✓
- Minor gap: No `add_table` primitive (template only)

### Verdict: **PASS** ✓

---

## Brand Design System

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Void Black** | `#050505` | Dark background |
| **Stark White** | `#FFFFFF` | Light background, dark text |
| **Acid Green** | `#CCFF00` | Accent, CTAs, highlights |
| **Signal Red** | `#FF3B30` | Alerts, warmth accents |

### Typography

| Font | Usage |
|------|-------|
| **Season Mix** | Headlines, hero statements |
| **Season Sans** | Body text, UI, data |
| **Consolas** | HUD labels, technical overlays |

### Layout Principles

1. **Space to Breathe**: 40-50% negative space
2. **Split Compositions**: Text left, visuals right
3. **Extreme Hierarchy**: 72pt+ headlines, 9-12pt labels
4. **Tek on Img**: Data overlays on photography

---

## Quick Reference

### Constructor
```python
prs = SambaPresentation(
    theme="dark",           # "dark" | "light"
    context="internal",     # "internal" | "external" | "investor" | "partner"
    auto_branding=True,     # Auto-add logos
    auto_install_fonts=True # Install Season fonts
)
```

### Essential Methods
```python
# Templates
prs.add_title_slide(title, subtitle)
prs.add_content_slide(headline, points, image_path)
prs.add_metrics_slide([{value, label, accent}])
prs.add_end_slide()

# Primitives
slide = prs.add_slide()
prs.add_headline(slide, text, x, y, width, size, color)
prs.add_image(slide, path, x, y, width)

# HUD Overlays
prs.add_hud_coordinates(slide, x, y)
prs.add_tracking_dot(slide, x, y, label)

# Save
prs.save("output.pptx")
```

### Brand Checklist
Before saving, verify:
- [ ] Font correct? (Season Mix/Sans)
- [ ] "Tek on Img"? (HUD overlays on images)
- [ ] Clean? (40-50% negative space)
- [ ] Accent? (Touch of Acid Green)
- [ ] Logo placed? (End slide minimum)
- [ ] Speaker notes? (Talking points added)

---

## Resources

| Resource | Location |
|----------|----------|
| Python module | `scripts/samba_pptx.py` |
| Season fonts | `assets/fonts/` |
| Logos | `assets/logos/` |
| Brand guidelines | `references/brand-guidelines.md` |

### Dependencies
```bash
pip install python-pptx Pillow
```
