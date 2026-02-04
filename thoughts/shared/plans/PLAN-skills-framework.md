# Implementation Plan: Skills Development Framework
Generated: 2026-02-02

## Goal

Establish a comprehensive skills development framework for the Samba Slack agent that:
1. Standardizes existing skills to the official Agent Skills specification
2. Documents skill creation best practices
3. Downloads/adapts useful official skills from Anthropic
4. Creates a reusable playbook for future skill development

## Research Summary

### Official Agent Skills Specification (agentskills.io)

**Format Requirements:**
- Skills are directories containing a `SKILL.md` file at minimum
- YAML frontmatter with required fields: `name`, `description`
- Optional fields: `license`, `compatibility`, `metadata`, `allowed-tools`

**Name Field Rules:**
- Max 64 characters
- Lowercase letters, numbers, hyphens only
- Cannot start/end with hyphen or contain consecutive hyphens
- Must match parent directory name

**Description Field:**
- Max 1024 characters
- Must describe what skill does AND when to use it
- Write in third person (injected into system prompt)
- Include specific trigger keywords

**Progressive Disclosure (3 levels):**
1. Metadata (name + description) - ~100 tokens, always loaded
2. SKILL.md body - <5000 tokens recommended, loaded when skill triggers
3. Bundled resources (scripts/, references/, assets/) - loaded as needed

**Directory Structure:**
```
skill-name/
├── SKILL.md          # Required
├── scripts/          # Optional - executable code
├── references/       # Optional - documentation loaded on demand
└── assets/           # Optional - templates, images, data files
```

### Best Practices from platform.claude.com

**Core Principles:**
1. **Concise is key** - Only add context Claude doesn't already have
2. **Set appropriate degrees of freedom** - Match specificity to task fragility
3. **Test with target models** - Different models need different detail levels

**Writing Guidelines:**
- Keep SKILL.md body under 500 lines
- Avoid deeply nested references (keep one level deep from SKILL.md)
- Use consistent terminology throughout
- Avoid time-sensitive information
- Provide templates and examples for output format

**Workflow Patterns:**
- Use checklists for multi-step processes
- Implement feedback loops (validate → fix → repeat)
- Support conditional workflows with decision trees

### Official Anthropic Skills (github.com/anthropics/skills)

**Available Production Skills:**
- `docx` - Word document creation/editing
- `pdf` - PDF document handling
- `pptx` - PowerPoint presentation creation
- `xlsx` - Excel spreadsheet handling

**Example Skills (for reference):**
- Creative/design skills
- MCP server generation
- Web app testing
- Brand guideline integration

---

## Existing Codebase Analysis

### Current Skills Location: `.skills/`

**Skills Inventory (13 total):**

| Skill | Format Quality | Notes |
|-------|---------------|-------|
| `samba-slides` | Excellent | Full v5 Hybrid format with decision-theory modal logic |
| `docx` | Good | Standard format, good description |
| `pdf` | Good | Standard format, references separate files |
| `xlsx` | Good | Comprehensive, follows standards |
| `skill-creator` | Good | Meta-skill for creating skills |
| `d3js-visualization` | Good | Comprehensive, 820+ lines (should split) |
| `mcp-builder` | Good | Well-structured with phase workflow |
| `summarize` | Basic | Samba-specific, good but minimal |
| `example` | Minimal | Demo skill only |
| `algorithmic-art` | Unknown | Needs audit |
| `frontend-design` | Unknown | Needs audit |
| `web-artifacts-builder` | Unknown | Needs audit |
| `webapp-testing` | Unknown | Needs audit |

### Format Variations Observed

**Current Variations:**
1. **Name field inconsistency**: Some use full name (`skill-creator`), others abbreviated (`d3-viz`)
2. **Description quality**: Ranges from minimal ("A sample skill...") to comprehensive
3. **License field**: Present in some, absent in others
4. **Metadata field**: Only `samba-slides` uses v5 format with `version`, `format`, `verified`
5. **Body structure**: Varies significantly in organization

**Samba-Slides as Gold Standard:**
- Uses v5 Hybrid format with decision-theory modal logic
- Includes: Quick Start, Initiation, Wizard Protocol, State Space, Action Space, Policy, Constraints, Verification
- Has comprehensive references/, scripts/, assets/ directories
- Clear separation of concerns

---

## Implementation Phases

### Phase 1: Create Skill Development Playbook

**Files to create:**
- `.skills/PLAYBOOK.md` - Main playbook document
- `.skills/TEMPLATE/SKILL.md` - Standard template

**Steps:**
1. Create playbook document with sections:
   - Quick reference (when to create skills)
   - Format specification summary
   - Step-by-step creation process
   - Quality checklist
   - Examples of good patterns
2. Create SKILL.md template following Agent Skills spec
3. Include both basic and advanced (v5 Hybrid) templates
4. Document Samba-specific conventions

**Acceptance criteria:**
- [ ] PLAYBOOK.md covers all key topics from research
- [ ] TEMPLATE includes required frontmatter
- [ ] Template includes placeholder sections
- [ ] Examples show both simple and complex patterns

### Phase 2: Download/Adapt Official Skills

**Skills to evaluate for download:**
- `pptx` from Anthropic - compare with `samba-slides`
- Any Anthropic skills that complement existing capabilities

**Steps:**
1. Clone or download from `github.com/anthropics/skills`
2. Compare Anthropic `pptx` with local `samba-slides`
3. Identify any useful patterns or scripts to adopt
4. Document differences and rationale for keeping custom version

**Acceptance criteria:**
- [ ] Official skills reviewed
- [ ] Decision documented: adopt/adapt/keep-custom
- [ ] Any adopted skills placed in `.skills/official/` subdirectory

### Phase 3: Audit Existing Skills

**Files to audit:**
- `.skills/algorithmic-art/SKILL.md`
- `.skills/frontend-design/SKILL.md`
- `.skills/web-artifacts-builder/SKILL.md`
- `.skills/webapp-testing/SKILL.md`

**Audit checklist per skill:**
1. Name field compliance (lowercase, no reserved words, matches directory)
2. Description quality (includes what + when, third person, <1024 chars)
3. Body length (<500 lines recommended)
4. Progressive disclosure (large content in references/)
5. Consistent terminology
6. Working examples

**Steps:**
1. Read each skill file
2. Document compliance issues
3. Prioritize fixes by severity

**Acceptance criteria:**
- [ ] All 13 skills audited
- [ ] Issues documented in audit report
- [ ] Priority ranking created

### Phase 4: Standardize High-Priority Skills

**Skills needing updates (based on Phase 3):**
- TBD after audit

**Standardization tasks:**
1. Fix name field violations
2. Improve descriptions to meet spec
3. Split files >500 lines
4. Add missing license fields
5. Convert to consistent body structure

**Acceptance criteria:**
- [ ] All critical issues resolved
- [ ] All skills pass validation
- [ ] Consistent format across skills

### Phase 5: Create Validation Tooling

**Files to create:**
- `.skills/scripts/validate_skill.py` - Skill validator
- `.skills/scripts/init_skill.py` - Skill initializer (from skill-creator)

**Validation checks:**
1. YAML frontmatter parse
2. Required fields present
3. Name field rules
4. Description length
5. Body line count warning
6. File reference validation

**Steps:**
1. Create Python script for validation
2. Integrate with skill-creator workflow
3. Document usage in PLAYBOOK.md

**Acceptance criteria:**
- [ ] Script validates all required fields
- [ ] Script warns on best-practice violations
- [ ] Script can be run standalone or via skill-creator

---

## Testing Strategy

### Validation Testing
- Run validator on all 13 existing skills
- Document any false positives/negatives
- Iterate on validation rules

### Integration Testing
- Test skill loading in Orion agent
- Verify progressive disclosure works (metadata vs body vs references)
- Test trigger conditions match descriptions

### User Acceptance
- Create a new skill using playbook
- Verify playbook covers all necessary steps
- Gather feedback on clarity

---

## Risks & Considerations

### Breaking Changes
- **Risk**: Renaming skills may break existing references
- **Mitigation**: Keep old names as aliases if needed, update all references

### Scope Creep
- **Risk**: Converting all skills to v5 Hybrid format
- **Mitigation**: Only require v5 for complex workflow skills; basic skills use standard format

### Compatibility
- **Risk**: Anthropic skills use different conventions than local skills
- **Mitigation**: Document differences, maintain separate `official/` directory

### Time Investment
- **Risk**: Comprehensive standardization takes significant time
- **Mitigation**: Prioritize by usage frequency; defer rarely-used skills

---

## Estimated Complexity

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| 1. Playbook | Medium (2-3 hours) | None |
| 2. Download Official | Low (1 hour) | Phase 1 |
| 3. Audit | Medium (2-3 hours) | Phase 1 |
| 4. Standardize | High (4-6 hours) | Phase 3 |
| 5. Validation | Medium (2-3 hours) | Phase 1 |

**Total Estimate:** 11-16 hours

**Recommended Order:**
1. Phase 1 (Playbook) - establishes standards
2. Phase 3 (Audit) - identifies work needed
3. Phase 5 (Validation) - automates checking
4. Phase 2 (Official Skills) - can run in parallel
5. Phase 4 (Standardize) - apply standards with tooling

---

## Appendix A: Agent Skills YAML Frontmatter Reference

```yaml
---
# REQUIRED
name: my-skill-name
description: What this skill does and when to use it. Write in third person.

# OPTIONAL
license: Apache-2.0
compatibility: Designed for Claude Code
metadata:
  author: example-org
  version: "1.0"
allowed-tools: Bash(git:*) Read
---
```

## Appendix B: Samba Skills Conventions

**Beyond the standard spec, Samba skills should:**
1. Reference Orion agent context where relevant
2. Use Slack mrkdwn format for output examples
3. Include rate limiting considerations for Slack API calls
4. Follow Samba branding guidelines for visual outputs

## Appendix C: v5 Hybrid Format Structure

For complex workflow skills, use the decision-theory modal logic format:

```markdown
# Option: skill-name

[Quick description]

---

## Quick Start (REQUIRED)
[Minimal working example]

## Initiation (I)
[Trigger conditions]

## Wizard Protocol (if interactive)
[Discovery questions]

## Observation Space (Y)
[What the agent observes]

## State Space (S)
[Possible states]

## Action Space (U)
[Available actions per state]

## Policy (π)
[State → Action mappings]

## Termination (β)
[Success/failure/abort conditions]

## Q-Heuristics
[Value guidance for action selection]

## Constraints
[Temporal, Epistemic, Deontic, Dynamic]

## Verification
[Safety and liveness properties]
```

---

## Output Artifacts

After implementation, the following artifacts will exist:

```
.skills/
├── PLAYBOOK.md                    # Skills development guide
├── TEMPLATE/
│   └── SKILL.md                   # Standard template
├── scripts/
│   ├── validate_skill.py          # Validator script
│   └── init_skill.py              # Initializer script
├── official/                      # Downloaded Anthropic skills
│   └── (any adopted skills)
└── (existing skills, standardized)
```

---

**Plan Author:** Plan Agent
**Plan Date:** 2026-02-02
**Status:** Ready for implementation
