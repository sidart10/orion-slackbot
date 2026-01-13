# Samba Slides: Component-Based Architecture Plan

## Executive Summary

Redesign samba-slides from a **template-based** system (rigid layouts) to a **component-based** system (flexible primitives with brand styling). Users can compose any layout while brand guidelines are automatically enforced.

---

## Current Problem

### Template-Based (Rigid)
```python
# You're stuck with fixed layouts
prs.add_content_slide(headline, points)  # Always 50/50 split
prs.add_metrics_slide(metrics)           # Always horizontal
```

**Limitations:**
- Can't customize element positions
- Can't add multiple images freely
- Can't create non-standard layouts
- Every new layout requires a new template method

---

## Proposed Solution

### Component-Based (Flexible)

```python
slide = prs.add_slide()

# Place branded elements ANYWHERE using ratio coordinates (0.0 - 1.0)
prs.add_headline(slide, "Title", x=0.05, y=0.1)
prs.add_body_text(slide, "Description here", x=0.05, y=0.25, width=0.4)
prs.add_image(slide, "photo1.jpg", x=0.5, y=0.1, width=0.45, height=0.4)
prs.add_image(slide, "photo2.jpg", x=0.5, y=0.55, width=0.45, height=0.4)
prs.add_accent_bar(slide, position="right", width=0.02)
```

**Benefits:**
- Full layout flexibility
- Brand styling automatic
- Compose any design
- Templates become optional shortcuts

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: CONVENIENCE TEMPLATES (Optional Shortcuts)        │
│  add_title_slide(), add_content_slide(), add_metrics_slide()│
│  Pre-composed layouts using primitives below                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: BRAND PRIMITIVES (Core Building Blocks)           │
│  add_headline(), add_body_text(), add_image(), add_shape()  │
│  Styled with Samba fonts/colors, positioned freely          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: BRAND CONSTANTS (Design System)                   │
│  SambaColors, SambaFonts, SambaSizes                        │
│  Enforced automatically by primitives                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Brand Constants (Already Exists)

No changes needed - these define the design system:

```python
class SambaColors:
    VOID_BLACK = "#050505"
    STARK_WHITE = "#FFFFFF"
    ACID_GREEN = "#CCFF00"
    SIGNAL_RED = "#FF3B30"

class SambaFonts:
    HEADLINE = "Season Mix"
    BODY = "Season Sans"
    HUD = "Consolas"

class SambaSizes:
    TITLE_HUGE = 120pt
    TITLE_LARGE = 72pt
    HEADLINE = 44pt
    BODY = 18pt
    CAPTION = 14pt
```

---

## Layer 2: Brand Primitives (NEW)

### Coordinate System

All positions use **ratio coordinates** (0.0 to 1.0):
- `x=0.0` = left edge, `x=1.0` = right edge
- `y=0.0` = top edge, `y=1.0` = bottom edge
- `width=0.5` = 50% of slide width
- `height=0.3` = 30% of slide height

### Text Primitives

```python
# Headlines - Season Mix font, large sizes
prs.add_headline(
    slide,
    text="Your Headline",
    x=0.05,              # 5% from left
    y=0.1,               # 10% from top
    width=0.9,           # 90% of slide width
    size="large",        # "huge" (120pt), "large" (72pt), "medium" (44pt)
    color="text",        # "text" (auto), "accent", "white", "black", or hex
    align="left"         # "left", "center", "right"
)

# Body text - Season Sans font, readable sizes
prs.add_body_text(
    slide,
    text="Your body copy here...",
    x=0.05, y=0.3,
    width=0.4, height=0.5,
    size="body",         # "body" (18pt), "caption" (14pt), "micro" (12pt)
    color="text",
    wrap=True
)

# Bullet list
prs.add_bullets(
    slide,
    items=["Point one", "Point two", "Point three"],
    x=0.05, y=0.3,
    width=0.4,
    size="body",
    bullet_color="accent"  # Acid Green bullets
)

# Metric/number display
prs.add_metric(
    slide,
    value="500M+",
    label="Connected Devices",
    x=0.1, y=0.3,
    accent=True          # Use Acid Green for value
)
```

### Image & Media Primitives

```python
# Single image
prs.add_image(
    slide,
    path="photo.jpg",
    x=0.5, y=0.1,
    width=0.45,          # Height auto-calculated to maintain aspect
    height=None,         # Or specify to crop/stretch
    fit="contain",       # "contain", "cover", "stretch"
    opacity=1.0,
    border=None          # Or "accent" for Acid Green border
)

# Video embed
prs.add_video(
    slide,
    path="demo.mp4",
    x=0.1, y=0.2,
    width=0.8, height=0.6,
    poster="thumbnail.jpg",  # Preview image (shown before play)
    unit="ratio"             # or "inches" or "px"
)

# Background image (full-bleed)
prs.set_background_image(
    slide,
    path="background.jpg",
    opacity=0.3,         # Dim for text overlay
    overlay="dark"       # Add dark overlay for readability
)

# Image grid helper
prs.add_image_grid(
    slide,
    images=["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
    x=0.05, y=0.2,
    width=0.9, height=0.7,
    cols=2,              # 2x2 grid
    gap=0.02             # 2% gap between images
)
```

### Shape Primitives

```python
# Rectangle (for backgrounds, dividers)
prs.add_rectangle(
    slide,
    x=0.0, y=0.0,
    width=0.5, height=1.0,
    fill="accent",       # "accent", "dark", "light", or hex
    opacity=1.0
)

# Accent bar (common Samba element)
prs.add_accent_bar(
    slide,
    position="right",    # "left", "right", "top", "bottom"
    thickness=0.02,      # 2% of slide dimension
    color="accent"
)

# Circle/oval
prs.add_circle(
    slide,
    x=0.5, y=0.5,        # Center position
    size=0.1,            # Diameter as ratio
    fill="accent"
)

# Line
prs.add_line(
    slide,
    start=(0.1, 0.5),
    end=(0.9, 0.5),
    color="accent",
    thickness=2          # Points
)
```

### HUD Overlays (Existing - Keep As-Is)

```python
prs.add_hud_coordinates(slide, x, y, text)
prs.add_hud_timestamp(slide, x, y)
prs.add_tracking_dot(slide, x, y, label)
prs.add_bounding_box(slide, x, y, w, h, label)
prs.add_wireframe_grid(slide, rows, cols)
```

### Logo Primitives

```python
# Auto-selects correct logo based on context + theme
prs.add_logo(
    slide,
    position="bottom-right",  # Or x, y coordinates
    size="small"              # "small", "medium", "large"
)

# Manual logo with full control
prs.add_logo(
    slide,
    x=0.85, y=0.9,
    width=0.1,
    variant="wordmark"   # Uses logo-manifest.yaml
)
```

---

## Layer 3: Convenience Templates (Refactored)

Templates become **optional shortcuts** that compose primitives:

```python
def add_title_slide(self, title, subtitle=None, include_logo=None):
    """Convenience: Creates a standard title slide layout."""
    slide = self.add_slide()

    # Compose using primitives
    self.add_headline(slide, title, x=0.05, y=0.2, size="large")

    if subtitle:
        self.add_body_text(slide, subtitle, x=0.05, y=0.85, size="body")

    if include_logo or self.auto_branding:
        self.add_logo(slide, position="bottom-right", size="small")

    return slide

def add_content_slide(self, headline, points, image_path=None):
    """Convenience: Creates a 50/50 split content slide."""
    slide = self.add_slide()

    # Left side: text
    self.add_headline(slide, headline, x=0.05, y=0.1, width=0.45, size="medium")
    self.add_bullets(slide, points, x=0.05, y=0.3, width=0.45)

    # Right side: image or placeholder
    if image_path:
        self.add_image(slide, image_path, x=0.52, y=0.1, width=0.45, height=0.8)
    else:
        self.add_rectangle(slide, x=0.52, y=0.1, width=0.45, height=0.8, fill="dark")

    return slide
```

**Users can:**
1. Use templates for quick standard layouts
2. Use primitives for custom layouts
3. Mix both - start with template, add more elements

---

## Example: Creating Custom Layouts

### Example 1: Three-Column Image Gallery

```python
slide = prs.add_slide()

prs.add_headline(slide, "Our Technology", x=0.05, y=0.05, width=0.9, align="center")

# Three images side by side
prs.add_image(slide, "tech1.jpg", x=0.05, y=0.2, width=0.28, height=0.7)
prs.add_image(slide, "tech2.jpg", x=0.36, y=0.2, width=0.28, height=0.7)
prs.add_image(slide, "tech3.jpg", x=0.67, y=0.2, width=0.28, height=0.7)

# Captions under each
prs.add_body_text(slide, "Detection", x=0.05, y=0.92, width=0.28, align="center", size="caption")
prs.add_body_text(slide, "Analysis", x=0.36, y=0.92, width=0.28, align="center", size="caption")
prs.add_body_text(slide, "Insights", x=0.67, y=0.92, width=0.28, align="center", size="caption")

prs.add_logo(slide, position="bottom-right", size="small")
```

### Example 2: Full-Bleed Image with Text Overlay

```python
slide = prs.add_slide()

# Background image with dark overlay
prs.set_background_image(slide, "hero.jpg", overlay="dark", opacity=0.6)

# Large centered headline
prs.add_headline(slide, "See What Others Can't",
    x=0.1, y=0.35, width=0.8,
    size="huge", align="center", color="white")

prs.add_body_text(slide, "AI-powered audience intelligence",
    x=0.1, y=0.6, width=0.8,
    align="center", color="white")

prs.add_logo(slide, x=0.45, y=0.85, size="medium")
```

### Example 3: Data Dashboard Style

```python
slide = prs.add_slide()

# Left accent bar
prs.add_accent_bar(slide, position="left", thickness=0.01)

# Title area
prs.add_headline(slide, "Q4 Performance", x=0.05, y=0.05, size="medium")
prs.add_body_text(slide, "Real-time metrics dashboard", x=0.05, y=0.15, size="caption", color="gray")

# Metrics row
prs.add_metric(slide, "512M", "Devices", x=0.05, y=0.3, accent=True)
prs.add_metric(slide, "2.8B", "Daily Events", x=0.3, y=0.3)
prs.add_metric(slide, "38ms", "Avg Latency", x=0.55, y=0.3)
prs.add_metric(slide, "99.9%", "Uptime", x=0.8, y=0.3)

# Chart/image area
prs.add_image(slide, "chart.png", x=0.05, y=0.5, width=0.55, height=0.45)

# Side panel with bullets
prs.add_rectangle(slide, x=0.65, y=0.5, width=0.32, height=0.45, fill="dark")
prs.add_body_text(slide, "Key Drivers", x=0.67, y=0.52, size="caption", color="accent")
prs.add_bullets(slide,
    ["Expanded device coverage", "Improved processing", "New client wins"],
    x=0.67, y=0.6, width=0.28, size="caption"
)
```

### Example 4: Video Demo Slide

```python
slide = prs.add_slide()

prs.add_headline(slide, "See It In Action", x=0.05, y=0.05, size="medium")

# Centered video with poster frame
prs.add_video(slide, "product_demo.mp4",
    x=0.1, y=0.15, width=0.8, height=0.65,
    poster="demo_thumbnail.jpg"
)

prs.add_body_text(slide, "Click to play demo",
    x=0.1, y=0.85, width=0.8, align="center", size="caption", color="gray")

prs.add_logo(slide, position="bottom-right", size="small")
```

### Example 5: Using Different Coordinate Units

```python
slide = prs.add_slide()

# Default: ratio coordinates (0.0-1.0)
prs.add_headline(slide, "Ratio", x=0.05, y=0.05)

# Using inches
prs.add_body_text(slide, "Positioned in inches",
    x=1.0, y=2.5, width=5.0, unit="inches")

# Using pixels (96 DPI)
prs.add_rectangle(slide, x=100, y=200, width=300, height=150, unit="px")
```

### Example 6: Element Grouping

```python
slide = prs.add_slide()

# Create a group for a metric card
group = prs.create_group(slide, name="metric-card")

# Add shapes to the group
bg = prs.add_rectangle(slide, x=0.1, y=0.2, width=0.25, height=0.3, fill="dark")
val = prs.add_headline(slide, "512M", x=0.12, y=0.25, size="large", color="accent")
label = prs.add_body_text(slide, "DEVICES", x=0.12, y=0.42, size="caption")

prs.add_to_group(group, bg)
prs.add_to_group(group, val)
prs.add_to_group(group, label)

# Finalize and move entire group
card = prs.finalize_group(group)
prs.move_group(card, x=0.5, y=0.2)  # Move to new position
```

---

## Implementation Plan

### Phase 1: Core Primitives
1. `add_slide()` - Blank slide with themed background
2. `add_headline()` - Season Mix styled headlines
3. `add_body_text()` - Season Sans styled body text
4. `add_bullets()` - Styled bullet lists
5. `add_image()` - Image with positioning
6. `add_rectangle()` - Shape primitive
7. `add_logo()` - Refactored logo placement

### Phase 2: Extended Primitives
8. `add_metric()` - Large number + label combo
9. `add_accent_bar()` - Common brand element
10. `add_circle()`, `add_line()` - More shapes
11. `set_background_image()` - Full-bleed backgrounds

### Phase 3: Media Support
12. `add_video()` - Video embedding with poster frame
13. `add_image_grid()` - Multi-image helper
14. `set_background_image()` - Full-bleed backgrounds with overlay

### Phase 4: Element Grouping
15. `create_group()` - Create named group container
16. `add_to_group()` - Add shapes to group
17. `finalize_group()` - Build the actual PPTX group
18. `move_group()` - Move entire group to new position

### Phase 5: Coordinate Systems
19. Update `_to_inches()` helper to support "ratio", "inches", "px"
20. Add `unit` parameter to all positioning methods

### Phase 6: Refactor Templates
21. Rewrite all `add_*_slide()` methods to use primitives
22. Keep them as convenience shortcuts
23. Document that they're optional

### Phase 7: Documentation
24. Update SKILL.md with primitive API
25. Add layout examples gallery
26. Create "recipes" for common layouts
27. Document coordinate systems with examples

---

## API Summary

### Slide Management
| Method | Description |
|--------|-------------|
| `add_slide(theme)` | Create blank themed slide |
| `set_background_image(slide, path, overlay, opacity)` | Set slide background |

### Text Primitives
| Method | Description |
|--------|-------------|
| `add_headline(slide, text, x, y, width, size, color, align)` | Season Mix headline |
| `add_body_text(slide, text, x, y, width, height, size, color, wrap, align)` | Season Sans body |
| `add_bullets(slide, items, x, y, width, size, bullet_color)` | Bullet list |
| `add_metric(slide, value, label, x, y, accent)` | Big number + label |

### Media Primitives
| Method | Description |
|--------|-------------|
| `add_image(slide, path, x, y, width, height, fit, opacity, border)` | Image |
| `add_video(slide, path, x, y, width, height, poster, autoplay)` | Video |
| `add_image_grid(slide, images, x, y, width, height, cols, gap)` | Image grid |

### Shape Primitives
| Method | Description |
|--------|-------------|
| `add_rectangle(slide, x, y, width, height, fill, opacity)` | Rectangle |
| `add_accent_bar(slide, position, thickness, color)` | Accent bar |
| `add_circle(slide, x, y, size, fill)` | Circle |
| `add_line(slide, start, end, color, thickness)` | Line |

### Branding
| Method | Description |
|--------|-------------|
| `add_logo(slide, position, size, variant)` | Context-aware logo |

### Convenience Templates (Optional)
| Method | Description |
|--------|-------------|
| `add_title_slide(...)` | Pre-composed title layout |
| `add_content_slide(...)` | Pre-composed 50/50 layout |
| `add_metrics_slide(...)` | Pre-composed metrics layout |
| ... | (all existing templates remain) |

---

## Migration Path

**Backward compatible** - existing code continues to work:
```python
# OLD WAY - still works
prs.add_title_slide("Title", "Subtitle")
prs.add_content_slide("Headline", ["Point 1", "Point 2"])

# NEW WAY - full flexibility
slide = prs.add_slide()
prs.add_headline(slide, "Title", x=0.1, y=0.2)
prs.add_image(slide, "photo.jpg", x=0.5, y=0.3, width=0.4)
```

---

## Open Questions

1. **Coordinate system**: Ratios (0.0-1.0) vs. inches vs. pixels?
   - Recommendation: Ratios for simplicity, with optional inch/pixel support

2. **Z-ordering**: How to control layer order when elements overlap?
   - Recommendation: Elements added later appear on top (natural stacking)

3. **Grouping**: Should we support grouping elements?
   - Recommendation: Phase 2 feature if needed

4. **Animation**: Support for PowerPoint animations?
   - Recommendation: Out of scope (complex, limited python-pptx support)

---

## Next Steps

1. Review and approve this plan
2. Implement Phase 1 (core primitives)
3. Test with real presentation use cases
4. Iterate based on feedback
5. Complete remaining phases
