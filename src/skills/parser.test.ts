/**
 * Parser Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#2 - Skill name, description, instructions, tools extracted
 * @see AC#5 - Tool names validated as snake_case
 */

import { describe, it, expect } from 'vitest';
import { parseSkillMd } from './parser.js';

describe('parseSkillMd', () => {
  it('parses valid skill with minimal frontmatter', () => {
    const content = `---
name: test_skill
description: A test skill
---

# Test Skill

This is the skill content.`;

    const skill = parseSkillMd(content, '/path/to/SKILL.md');

    expect(skill.name).toBe('test_skill');
    expect(skill.description).toBe('A test skill');
    expect(skill.instructions).toBe('# Test Skill\n\nThis is the skill content.');
    expect(skill.filePath).toBe('/path/to/SKILL.md');
    expect(skill.tools).toBeUndefined();
    expect(skill.hasExecutableScripts).toBe(false);
  });

  it('parses skill with all optional fields', () => {
    const content = `---
name: deep_research
description: Conduct comprehensive research
version: 1.0.0
author: Orion Team
---

# Research Instructions`;

    const skill = parseSkillMd(content, '/skills/research/SKILL.md');

    expect(skill.name).toBe('deep_research');
    expect(skill.description).toBe('Conduct comprehensive research');
    expect(skill.version).toBe('1.0.0');
    expect(skill.author).toBe('Orion Team');
  });

  it('parses skill with tools', () => {
    const content = `---
name: search_skill
description: Search things
tools:
  - name: initiate_search
    description: Start a search
    parameters:
      query:
        type: string
        description: Search query
        required: true
      limit:
        type: number
        description: Max results
---

Instructions here.`;

    const skill = parseSkillMd(content, '/path/SKILL.md');

    expect(skill.tools).toHaveLength(1);
    expect(skill.tools![0].name).toBe('initiate_search');
    expect(skill.tools![0].description).toBe('Start a search');
    expect(skill.tools![0].parameters.query).toEqual({
      type: 'string',
      description: 'Search query',
      required: true,
      items: undefined,
      enum: undefined,
    });
    expect(skill.tools![0].parameters.limit).toEqual({
      type: 'number',
      description: 'Max results',
      required: false,
      items: undefined,
      enum: undefined,
    });
  });

  it('throws on missing name', () => {
    const content = `---
description: No name here
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'SKILL.md missing required field: name'
    );
  });

  it('throws on missing description', () => {
    const content = `---
name: no_desc
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'SKILL.md missing required field: description'
    );
  });

  it('throws on tool without name', () => {
    const content = `---
name: test
description: test
tools:
  - description: Tool without name
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'Tool at index 0 missing name'
    );
  });

  it('throws on invalid tool name (camelCase)', () => {
    const content = `---
name: test
description: test
tools:
  - name: searchApi
    description: Bad name
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'Tool name "searchApi" invalid. Must be snake_case'
    );
  });

  it('throws on invalid tool name (PascalCase)', () => {
    const content = `---
name: test
description: test
tools:
  - name: SearchApi
    description: Bad name
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'Tool name "SearchApi" invalid. Must be snake_case'
    );
  });

  it('throws on invalid tool name (kebab-case)', () => {
    const content = `---
name: test
description: test
tools:
  - name: search-api
    description: Bad name
---

Content`;

    expect(() => parseSkillMd(content, '/path/SKILL.md')).toThrow(
      'Tool name "search-api" invalid. Must be snake_case'
    );
  });

  it('handles empty instructions gracefully', () => {
    const content = `---
name: minimal
description: Minimal skill
---`;

    const skill = parseSkillMd(content, '/path/SKILL.md');

    expect(skill.instructions).toBe('');
  });
});

