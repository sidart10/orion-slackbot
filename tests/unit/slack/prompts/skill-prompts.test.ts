/**
 * Skill Prompts Tests
 *
 * Unit tests for skill-aware prompt generation functions.
 *
 * @see Story 7.7 - Skill-Aware Suggested Prompts
 * @see ATDD Checklist: atdd-checklist-7-7-skill-aware-suggested-prompts.md
 */

import { describe, it, expect } from 'vitest';
import {
  getSkillAwarePrompts,
  analyzeResponseForSkillPrompts,
  getSkillFollowUpPrompts,
  EXCLUDED_SKILLS,
  SKILL_PROMPT_MAP,
} from '@/slack/prompts/skill-prompts.js';
import type { SkillInfo } from '@/slack/prompts/prompt-factory.js';

// Test helper to create SkillInfo objects
function createSkillInfo(name: string): SkillInfo {
  return {
    name,
    skillId: name === 'xlsx' || name === 'pdf' || name === 'docx'
      ? name
      : `skl_${name}`,
    type: ['xlsx', 'pdf', 'docx'].includes(name) ? 'anthropic' : 'custom',
    version: 'latest',
  };
}

describe('skill-prompts', () => {
  describe('getSkillAwarePrompts', () => {
    // AC1: Skill prompts included when skills available
    it('returns skill prompts when skills are available', () => {
      const skills: SkillInfo[] = [createSkillInfo('xlsx')];
      const prompts = getSkillAwarePrompts(skills);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].title.toLowerCase()).toContain('spreadsheet');
    });

    // AC1: Multiple skills produce blended prompts
    it('returns prompts for multiple skills', () => {
      const skills: SkillInfo[] = [
        createSkillInfo('xlsx'),
        createSkillInfo('pdf'),
        createSkillInfo('summarize'),
      ];
      const prompts = getSkillAwarePrompts(skills);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts.length).toBeLessThanOrEqual(2); // MAX_SKILL_PROMPTS = 2
    });

    // AC1 Edge: Empty skills array produces no skill prompts
    it('returns empty array for empty skills', () => {
      const prompts = getSkillAwarePrompts([]);
      expect(prompts).toEqual([]);
    });

    // AC1 Edge: Undefined availableSkills produces no skill prompts
    it('returns empty array for undefined skills', () => {
      const prompts = getSkillAwarePrompts(undefined);
      expect(prompts).toEqual([]);
    });

    // AC1 Edge: Only excluded skills produces no skill prompts
    it('returns empty array when only excluded skills are present', () => {
      const skills: SkillInfo[] = [
        createSkillInfo('mcp-builder'),
        createSkillInfo('skill-creator'),
      ];
      const prompts = getSkillAwarePrompts(skills);
      expect(prompts).toEqual([]);
    });

    // AC1 Error Handling: Malformed skill entry is gracefully skipped
    it('skips skills without matching prompt map entries', () => {
      const skills: SkillInfo[] = [
        createSkillInfo('unknown-skill'),
        createSkillInfo('xlsx'),
      ];
      const prompts = getSkillAwarePrompts(skills);

      expect(prompts.length).toBe(1);
      expect(prompts[0].title.toLowerCase()).toContain('spreadsheet');
    });

    // AC4: Maximum 2 skill prompts returned
    it('returns maximum 2 prompts even with many skills', () => {
      const skills: SkillInfo[] = [
        createSkillInfo('xlsx'),
        createSkillInfo('pdf'),
        createSkillInfo('docx'),
        createSkillInfo('summarize'),
        createSkillInfo('d3js-visualization'),
      ];
      const prompts = getSkillAwarePrompts(skills);
      expect(prompts.length).toBeLessThanOrEqual(2);
    });

    // AC4: All user-facing skills have prompts
    it('has prompts defined for all user-facing skills', () => {
      const userFacingSkills = [
        'xlsx',
        'pdf',
        'docx',
        'summarize',
        'd3js-visualization',
        'algorithmic-art',
        'frontend-design',
      ];

      for (const skillName of userFacingSkills) {
        expect(SKILL_PROMPT_MAP[skillName]).toBeDefined();
        expect(SKILL_PROMPT_MAP[skillName].title).toBeTruthy();
        expect(SKILL_PROMPT_MAP[skillName].message).toBeTruthy();
      }
    });

    // AC4: Excluded skills are properly defined
    it('has correct excluded skills defined', () => {
      const expectedExcluded = [
        'mcp-builder',
        'skill-creator',
        'webapp-testing',
        'web-artifacts-builder',
        'example',
      ];

      for (const skill of expectedExcluded) {
        expect(EXCLUDED_SKILLS.has(skill)).toBe(true);
      }
    });
  });

  describe('analyzeResponseForSkillPrompts', () => {
    // AC2: Data/table content triggers xlsx prompt
    it('triggers xlsx prompt for data/table content', () => {
      const responseContent = 'Here is the data table with quarterly sales figures';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['xlsx']);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].title.toLowerCase()).toContain('excel');
    });

    // AC2: Research/analysis content triggers pdf prompt
    it('triggers pdf prompt for research/analysis content', () => {
      const responseContent =
        'Based on my research and analysis of the market findings';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['pdf']);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].title.toLowerCase()).toContain('pdf');
    });

    // AC3: Trend data suggests visualization
    it('triggers visualization prompt for trend content', () => {
      const responseContent =
        'The trend shows consistent growth over the period';
      const prompts = analyzeResponseForSkillPrompts(responseContent, [
        'd3js-visualization',
      ]);

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].title.toLowerCase()).toContain('visualize');
    });

    // AC3: Comparison content suggests visualization
    it('triggers visualization prompt for comparison content', () => {
      const responseContent =
        'Comparing options A and B, we see significant differences';
      const prompts = analyzeResponseForSkillPrompts(responseContent, [
        'd3js-visualization',
      ]);

      expect(prompts.length).toBeGreaterThan(0);
    });

    // AC3: Chart mention triggers visualization prompt
    it('triggers visualization prompt when chart is mentioned', () => {
      const responseContent = 'This would work well as a chart';
      const prompts = analyzeResponseForSkillPrompts(responseContent, [
        'd3js-visualization',
      ]);

      expect(prompts.length).toBeGreaterThan(0);
    });

    // AC3: Numeric content with multiple numbers
    it('triggers xlsx prompt for numeric patterns', () => {
      const responseContent =
        'Revenue was 100, then 150, then 200 over three quarters';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['xlsx']);

      expect(prompts.length).toBeGreaterThan(0);
    });

    // AC2 Edge: Response content without exportable patterns
    it('returns empty array for generic content', () => {
      const responseContent = 'Hello! How can I help you today?';
      const prompts = analyzeResponseForSkillPrompts(responseContent, [
        'xlsx',
        'pdf',
        'd3js-visualization',
      ]);

      expect(prompts).toEqual([]);
    });

    // AC2 Edge: Exportable content but skill not available
    it('returns empty when matching skill not available', () => {
      const responseContent = 'Here is the data table with numbers';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['pdf']); // xlsx not available

      expect(prompts).toEqual([]);
    });

    // AC2 Edge: Empty response content
    it('returns empty array for empty response content', () => {
      const prompts = analyzeResponseForSkillPrompts('', ['xlsx', 'pdf']);
      expect(prompts).toEqual([]);
    });

    // AC2 Edge: Undefined response content
    it('returns empty array for undefined response content', () => {
      const prompts = analyzeResponseForSkillPrompts(undefined, ['xlsx', 'pdf']);
      expect(prompts).toEqual([]);
    });

    // AC2 Edge: Case insensitive pattern matching
    it('matches patterns case-insensitively', () => {
      const responseContent = 'Here is the DATA TABLE with information';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['xlsx']);

      expect(prompts.length).toBeGreaterThan(0);
    });

    // AC2 Boundary: Multiple patterns match - limit to 2 prompts
    it('limits to 2 prompts even when multiple patterns match', () => {
      const responseContent =
        'Here is the research data with table analysis and findings showing growth trends and a chart';
      const prompts = analyzeResponseForSkillPrompts(responseContent, [
        'xlsx',
        'pdf',
        'd3js-visualization',
        'docx',
      ]);

      expect(prompts.length).toBeLessThanOrEqual(2);
    });

    // Test document patterns
    it('triggers docx prompt for document content', () => {
      const responseContent = 'I can help you draft this document';
      const prompts = analyzeResponseForSkillPrompts(responseContent, ['docx']);

      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('getSkillFollowUpPrompts', () => {
    // AC5: xlsx follow-ups after spreadsheet creation
    it('returns xlsx follow-up prompts', () => {
      const prompts = getSkillFollowUpPrompts('xlsx');

      expect(prompts.length).toBeGreaterThan(0);
      const titles = prompts.map((p) => p.title.toLowerCase());
      expect(
        titles.some(
          (t) =>
            t.includes('chart') ||
            t.includes('formula') ||
            t.includes('format') ||
            t.includes('sheet')
        )
      ).toBe(true);
    });

    // AC5: pdf follow-ups after PDF generation
    it('returns pdf follow-up prompts', () => {
      const prompts = getSkillFollowUpPrompts('pdf');

      expect(prompts.length).toBeGreaterThan(0);
      const titles = prompts.map((p) => p.title.toLowerCase());
      expect(
        titles.some(
          (t) =>
            t.includes('section') ||
            t.includes('style') ||
            t.includes('summary') ||
            t.includes('docx')
        )
      ).toBe(true);
    });

    // AC5: summarize follow-ups after thread summarization
    it('returns summarize follow-up prompts', () => {
      const prompts = getSkillFollowUpPrompts('summarize');

      expect(prompts.length).toBeGreaterThan(0);
      const titles = prompts.map((p) => p.title.toLowerCase());
      expect(
        titles.some(
          (t) =>
            t.includes('thread') ||
            t.includes('export') ||
            t.includes('detail') ||
            t.includes('action')
        )
      ).toBe(true);
    });

    // AC5 Edge: Unknown skill usage returns empty follow-ups
    it('returns empty array for unknown skill', () => {
      const prompts = getSkillFollowUpPrompts('unknown-skill');
      expect(prompts).toEqual([]);
    });

    // AC5 Edge: Empty usedSkillInResponse returns empty
    it('returns empty array for empty skill name', () => {
      const prompts = getSkillFollowUpPrompts('');
      expect(prompts).toEqual([]);
    });

    // AC5 Edge: Undefined usedSkillInResponse returns empty
    it('returns empty array for undefined skill name', () => {
      const prompts = getSkillFollowUpPrompts(undefined);
      expect(prompts).toEqual([]);
    });

    // AC5 Boundary: Each supported skill has follow-ups defined
    it('has follow-ups for xlsx, pdf, summarize', () => {
      const skillsWithFollowUps = ['xlsx', 'pdf', 'summarize'];

      for (const skill of skillsWithFollowUps) {
        const prompts = getSkillFollowUpPrompts(skill);
        expect(prompts.length).toBeGreaterThan(0);
      }
    });

    // Test d3js-visualization follow-ups
    it('returns d3js-visualization follow-up prompts', () => {
      const prompts = getSkillFollowUpPrompts('d3js-visualization');

      expect(prompts.length).toBeGreaterThan(0);
    });

    // Test docx follow-ups
    it('returns docx follow-up prompts', () => {
      const prompts = getSkillFollowUpPrompts('docx');

      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('prompt structure validation', () => {
    it('all SKILL_PROMPT_MAP entries have title and message', () => {
      for (const [skillName, prompt] of Object.entries(SKILL_PROMPT_MAP)) {
        expect(prompt.title).toBeTruthy();
        expect(prompt.message).toBeTruthy();
        expect(typeof prompt.title).toBe('string');
        expect(typeof prompt.message).toBe('string');
        // Slack button titles should be short
        expect(prompt.title.length).toBeLessThanOrEqual(30);
      }
    });

    it('all follow-up prompts have title and message', () => {
      const testSkills = ['xlsx', 'pdf', 'summarize', 'd3js-visualization', 'docx'];

      for (const skill of testSkills) {
        const prompts = getSkillFollowUpPrompts(skill);
        for (const prompt of prompts) {
          expect(prompt.title).toBeTruthy();
          expect(prompt.message).toBeTruthy();
          expect(typeof prompt.title).toBe('string');
          expect(typeof prompt.message).toBe('string');
          // Slack button titles should be short
          expect(prompt.title.length).toBeLessThanOrEqual(30);
        }
      }
    });
  });
});
