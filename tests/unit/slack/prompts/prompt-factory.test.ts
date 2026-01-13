/**
 * Prompt Factory Tests
 *
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see Story 7.7 - Skill-Aware Suggested Prompts
 * @see AC#1 - Context-aware prompts (channel type, user, time)
 * @see AC#5 - Maximum 4 prompts (Slack API limit)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSuggestedPrompts,
  detectSkillUsage,
  getAvailableSkillsForPrompts,
  type PromptContext,
  type SkillInfo,
} from '@/slack/prompts/prompt-factory.js';
import { skillRegistry } from '@/skills/index.js';

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

describe('prompt-factory', () => {
  describe('generateSuggestedPrompts', () => {
    it('returns max 4 prompts (Slack API limit)', () => {
      const context: PromptContext = {
        channelType: 'im',
        userId: 'U12345',
      };

      const prompts = generateSuggestedPrompts(context);

      expect(prompts.length).toBeLessThanOrEqual(4);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('returns prompts with required fields (title and message)', () => {
      const context: PromptContext = {
        channelType: 'channel',
        userId: 'U12345',
      };

      const prompts = generateSuggestedPrompts(context);

      for (const prompt of prompts) {
        expect(prompt).toHaveProperty('title');
        expect(prompt).toHaveProperty('message');
        expect(typeof prompt.title).toBe('string');
        expect(typeof prompt.message).toBe('string');
        expect(prompt.title.length).toBeGreaterThan(0);
        expect(prompt.message.length).toBeGreaterThan(0);
      }
    });

    describe('context-aware prompts (AC#1)', () => {
      it('returns DM-specific prompts for im channel type', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // DM prompts should be personal assistance focused
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('research') ||
              t.includes('help') ||
              t.includes('summarize')
          )
        ).toBe(true);
      });

      it('returns channel-specific prompts for channel type', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // Channel prompts should be team collaboration focused
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('thread') ||
              t.includes('team') ||
              t.includes('research') ||
              t.includes('summarize')
          )
        ).toBe(true);
      });

      it('handles group channel type', () => {
        const context: PromptContext = {
          channelType: 'group',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        // Group channels should work similar to regular channels
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('follow-up prompts (AC#2)', () => {
      it('returns research follow-up prompts after research response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'research',
        };

        const prompts = generateSuggestedPrompts(context);

        // Research follow-ups should offer deeper exploration
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('deeper') ||
              t.includes('compare') ||
              t.includes('sources') ||
              t.includes('summary')
          )
        ).toBe(true);
      });

      it('returns action follow-up prompts after action response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'action',
        };

        const prompts = generateSuggestedPrompts(context);

        // Action follow-ups should offer status checks and adjustments
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('status') ||
              t.includes('adjust') ||
              t.includes('similar') ||
              t.includes('undo')
          )
        ).toBe(true);
      });
    });

    describe('error recovery prompts (AC#4)', () => {
      it('returns error recovery prompts after error response', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'error',
        };

        const prompts = generateSuggestedPrompts(context);

        // Error recovery should offer alternatives
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('try') ||
              t.includes('different') ||
              t.includes('help') ||
              t.includes('simpl')
          )
        ).toBe(true);
      });

      it('includes specific recovery suggestions based on error code', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'error',
          errorCode: 'TOOL_EXECUTION_FAILED',
        };

        const prompts = generateSuggestedPrompts(context);

        // Should still return valid prompts
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('clarification response type', () => {
      it('returns clarification follow-up prompts', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'clarification',
        };

        const prompts = generateSuggestedPrompts(context);

        // After clarification, should offer ways to provide more context
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('time-based prompts (AC#1)', () => {
      it('returns morning prompts during morning hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 9, // 9 AM
        };

        const prompts = generateSuggestedPrompts(context);

        // Morning prompts should include standup-related suggestions
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('standup') ||
              t.includes('today') ||
              t.includes('morning') ||
              t.includes('plan')
          )
        ).toBe(true);
      });

      it('returns EOD prompts during evening hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 17, // 5 PM
        };

        const prompts = generateSuggestedPrompts(context);

        // EOD prompts should include summary-related suggestions
        const promptTitles = prompts.map((p) => p.title.toLowerCase());
        expect(
          promptTitles.some(
            (t) =>
              t.includes('summary') ||
              t.includes('wrap') ||
              t.includes('done') ||
              t.includes('tomorrow')
          )
        ).toBe(true);
      });

      it('returns standard prompts during mid-day hours', () => {
        const context: PromptContext = {
          channelType: 'channel',
          userId: 'U12345',
          hourOfDay: 14, // 2 PM
        };

        const prompts = generateSuggestedPrompts(context);

        // Mid-day should still return valid prompts
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });
    });

    describe('prompt title length', () => {
      it('titles are short enough for Slack buttons (~25 chars max)', () => {
        const contexts: PromptContext[] = [
          { channelType: 'im', userId: 'U12345' },
          { channelType: 'channel', userId: 'U12345' },
          { channelType: 'im', userId: 'U12345', lastResponseType: 'research' },
          { channelType: 'im', userId: 'U12345', lastResponseType: 'error' },
        ];

        for (const context of contexts) {
          const prompts = generateSuggestedPrompts(context);
          for (const prompt of prompts) {
            // Slack recommends ~25 chars for button text
            expect(prompt.title.length).toBeLessThanOrEqual(30);
          }
        }
      });
    });

    // Story 7.7: Skill-aware prompt tests
    describe('skill-aware prompts (Story 7.7)', () => {
      // AC1: Skill prompts included when skills available
      it('includes skill prompts when availableSkills provided', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          availableSkills: [createSkillInfo('xlsx')],
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeLessThanOrEqual(4);
        const hasSkillPrompt = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('spreadsheet') ||
            p.message.toLowerCase().includes('spreadsheet')
        );
        expect(hasSkillPrompt).toBe(true);
      });

      // AC1: Multiple skills produce blended prompts
      it('blends multiple skill prompts with base prompts', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          availableSkills: [
            createSkillInfo('xlsx'),
            createSkillInfo('pdf'),
            createSkillInfo('d3js-visualization'),
          ],
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBe(4);
        // Should have skill prompts (max 2) and base prompts blended
        // Check for skill-specific prompts that wouldn't appear in base prompts
        const skillRelated = prompts.filter(
          (p) =>
            p.title.toLowerCase().includes('spreadsheet') ||
            p.title.toLowerCase().includes('generate pdf') ||
            p.title.toLowerCase().includes('visualize')
        );
        expect(skillRelated.length).toBeGreaterThanOrEqual(1);
        expect(skillRelated.length).toBeLessThanOrEqual(2);
      });

      // AC1 Edge: Empty skills array produces standard prompts (backwards compatible)
      it('returns standard prompts with empty availableSkills', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          availableSkills: [],
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });

      // AC1 Edge: Undefined availableSkills produces standard prompts (backwards compatible)
      it('returns standard prompts without availableSkills field', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });

      // AC1 Edge: Only excluded skills produces no skill prompts
      it('excludes developer tools from prompts', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          availableSkills: [
            createSkillInfo('mcp-builder'),
            createSkillInfo('skill-creator'),
          ],
        };

        const prompts = generateSuggestedPrompts(context);

        // Should still return base prompts, just no skill-specific ones
        expect(prompts.length).toBeGreaterThan(0);
        const hasDevTool = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('mcp') ||
            p.title.toLowerCase().includes('skill-creator')
        );
        expect(hasDevTool).toBe(false);
      });

      // AC2: Response content triggers skill export prompts
      it('suggests xlsx for data/table content', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          responseContent: 'Here is the data table with quarterly sales figures',
          availableSkills: [createSkillInfo('xlsx')],
        };

        const prompts = generateSuggestedPrompts(context);

        const hasExcelPrompt = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('excel') ||
            p.title.toLowerCase().includes('spreadsheet')
        );
        expect(hasExcelPrompt).toBe(true);
      });

      // AC2: Research content triggers pdf prompt
      it('suggests pdf for research/analysis content', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          responseContent: 'Based on my research and analysis of the market findings',
          availableSkills: [createSkillInfo('pdf')],
        };

        const prompts = generateSuggestedPrompts(context);

        const hasPdfPrompt = prompts.some(
          (p) => p.title.toLowerCase().includes('pdf')
        );
        expect(hasPdfPrompt).toBe(true);
      });

      // AC3: Trend data suggests visualization
      it('suggests visualization for trend content', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          responseContent: 'The trend shows consistent growth over the period',
          availableSkills: [createSkillInfo('d3js-visualization')],
        };

        const prompts = generateSuggestedPrompts(context);

        const hasVizPrompt = prompts.some(
          (p) => p.title.toLowerCase().includes('visualize')
        );
        expect(hasVizPrompt).toBe(true);
      });

      // AC5: Skill follow-ups take priority
      it('shows skill follow-ups when usedSkillInResponse is set', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          usedSkillInResponse: 'xlsx',
          hourOfDay: 9, // Morning - would normally show morning prompts
        };

        const prompts = generateSuggestedPrompts(context);

        // Should show xlsx follow-ups, not morning prompts
        const hasXlsxFollowUp = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('chart') ||
            p.title.toLowerCase().includes('formula') ||
            p.title.toLowerCase().includes('format') ||
            p.title.toLowerCase().includes('sheet')
        );
        expect(hasXlsxFollowUp).toBe(true);
      });

      // AC5: pdf follow-ups after PDF generation
      it('shows pdf follow-ups when usedSkillInResponse is pdf', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          usedSkillInResponse: 'pdf',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });

      // AC5: summarize follow-ups after thread summarization
      it('shows summarize follow-ups when usedSkillInResponse is summarize', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          usedSkillInResponse: 'summarize',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
        const hasSummarizeFollowUp = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('thread') ||
            p.title.toLowerCase().includes('export') ||
            p.title.toLowerCase().includes('detail') ||
            p.title.toLowerCase().includes('action')
        );
        expect(hasSummarizeFollowUp).toBe(true);
      });

      // AC5 Edge: Unknown skill returns normal prompts
      it('falls back to normal prompts for unknown usedSkillInResponse', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          usedSkillInResponse: 'unknown-skill',
        };

        const prompts = generateSuggestedPrompts(context);

        // Should fall through to base prompts
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
      });

      // AC5 Edge: Empty usedSkillInResponse
      it('handles empty usedSkillInResponse', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          usedSkillInResponse: '',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
      });

      // AC6: All skill scenarios respect MAX_PROMPTS = 4
      it('never exceeds 4 prompts with all skill features combined', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          availableSkills: [
            createSkillInfo('xlsx'),
            createSkillInfo('pdf'),
            createSkillInfo('docx'),
            createSkillInfo('summarize'),
            createSkillInfo('d3js-visualization'),
          ],
          responseContent:
            'Here is the research data with table analysis and findings showing growth trends',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeLessThanOrEqual(4);
      });

      // AC6: Skill blending maintains 4 prompt limit
      it('blends skill and context prompts within 4 limit', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'research',
          availableSkills: [createSkillInfo('xlsx'), createSkillInfo('pdf')],
          responseContent: 'Here is the data table',
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeLessThanOrEqual(4);
        expect(prompts.length).toBeGreaterThan(0);
      });

      // Integration: Full PromptContext with all skill fields
      it('handles full context with all new fields', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          channelId: 'C12345',
          lastResponseType: 'research',
          hourOfDay: 14,
          availableSkills: [createSkillInfo('xlsx'), createSkillInfo('pdf')],
          responseContent: 'Some analysis with data',
          usedSkillsInThread: ['summarize'],
        };

        const prompts = generateSuggestedPrompts(context);

        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.length).toBeLessThanOrEqual(4);
        for (const prompt of prompts) {
          expect(prompt.title).toBeTruthy();
          expect(prompt.message).toBeTruthy();
        }
      });

      // Integration: Priority order test
      it('prioritizes usedSkillInResponse over lastResponseType', () => {
        const context: PromptContext = {
          channelType: 'im',
          userId: 'U12345',
          lastResponseType: 'research', // Would normally show research follow-ups
          usedSkillInResponse: 'xlsx', // Should take priority
        };

        const prompts = generateSuggestedPrompts(context);

        // Should show xlsx follow-ups, not research follow-ups
        const hasXlsxFollowUp = prompts.some(
          (p) =>
            p.title.toLowerCase().includes('chart') ||
            p.title.toLowerCase().includes('formula')
        );
        expect(hasXlsxFollowUp).toBe(true);
      });
    });
  });

  // Story 7.7: detectSkillUsage helper tests
  describe('detectSkillUsage', () => {
    describe('file generation detection (highest priority)', () => {
      it('detects xlsx when file generated and response mentions spreadsheet', () => {
        const result = detectSkillUsage(
          'Here is your spreadsheet with the data',
          ['file_123']
        );
        expect(result).toBe('xlsx');
      });

      it('detects pdf when file generated and response mentions PDF', () => {
        const result = detectSkillUsage(
          'Here is your PDF report with the analysis',
          ['file_123']
        );
        expect(result).toBe('pdf');
      });

      it('detects docx when file generated and response mentions Word document', () => {
        const result = detectSkillUsage(
          'Here is your Word document',
          ['file_123']
        );
        expect(result).toBe('docx');
      });

      it('detects d3js-visualization when file generated and mentions visualization', () => {
        const result = detectSkillUsage(
          'Here is your data visualization chart',
          ['file_123']
        );
        expect(result).toBe('d3js-visualization');
      });

      it('defaults to xlsx for unknown file generation', () => {
        const result = detectSkillUsage(
          'Here is your file', // No specific skill keyword
          ['file_123']
        );
        expect(result).toBe('xlsx');
      });
    });

    describe('content pattern detection (lower priority)', () => {
      // Note: Content must be >50 chars to trigger pattern detection
      it('detects xlsx from spreadsheet keyword', () => {
        const result = detectSkillUsage('I can help you create a spreadsheet with that data and it will contain all the information you need for analysis');
        expect(result).toBe('xlsx');
      });

      it('detects pdf from PDF keyword', () => {
        const result = detectSkillUsage('This would make a great PDF document report that you can share with your team members');
        expect(result).toBe('pdf');
      });

      it('detects d3js-visualization from visualization keyword', () => {
        const result = detectSkillUsage('This data would look great as a visualization or chart that shows the trends over time clearly');
        expect(result).toBe('d3js-visualization');
      });

      it('detects summarize from summarize keyword', () => {
        const result = detectSkillUsage('I have summarized the thread for you and extracted all the key points from the conversation');
        expect(result).toBe('summarize');
      });
    });

    describe('edge cases', () => {
      it('returns undefined for empty content', () => {
        const result = detectSkillUsage('');
        expect(result).toBeUndefined();
      });

      it('returns undefined for undefined content', () => {
        const result = detectSkillUsage(undefined);
        expect(result).toBeUndefined();
      });

      it('returns undefined for short content without patterns', () => {
        const result = detectSkillUsage('Hello, how can I help?');
        expect(result).toBeUndefined();
      });

      it('returns undefined for empty generatedFileIds', () => {
        const result = detectSkillUsage('Generic response', []);
        expect(result).toBeUndefined();
      });
    });
  });

  // Story 7.7: getAvailableSkillsForPrompts helper tests
  describe('getAvailableSkillsForPrompts', () => {
    beforeEach(() => {
      // Reset registry state before each test
      skillRegistry._clear();
    });

    afterEach(() => {
      // Clean up after each test
      skillRegistry._clear();
    });

    it('returns built-in skills after initialization', () => {
      const skills = getAvailableSkillsForPrompts();

      // Should have at least the built-in skills (xlsx, pdf, docx)
      expect(skills.length).toBeGreaterThanOrEqual(3);

      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('xlsx');
      expect(skillNames).toContain('pdf');
      expect(skillNames).toContain('docx');
    });

    it('returns skills with correct SkillInfo structure', () => {
      const skills = getAvailableSkillsForPrompts();

      for (const skill of skills) {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('skillId');
        expect(skill).toHaveProperty('type');
        expect(skill).toHaveProperty('version');
        expect(typeof skill.name).toBe('string');
        expect(typeof skill.skillId).toBe('string');
        expect(['custom', 'anthropic']).toContain(skill.type);
        expect(typeof skill.version).toBe('string');
      }
    });

    it('built-in skills are present', () => {
      const skills = getAvailableSkillsForPrompts();

      // Built-in skills (xlsx, pdf, docx) should be present
      // Note: Custom skills with same name may override built-in in cache
      const xlsxSkill = skills.find((s) => s.name === 'xlsx');
      const pdfSkill = skills.find((s) => s.name === 'pdf');
      const docxSkill = skills.find((s) => s.name === 'docx');

      expect(xlsxSkill).toBeDefined();
      expect(pdfSkill).toBeDefined();
      expect(docxSkill).toBeDefined();
    });

    it('is idempotent - multiple calls return same results', () => {
      const skills1 = getAvailableSkillsForPrompts();
      const skills2 = getAvailableSkillsForPrompts();

      expect(skills1.length).toBe(skills2.length);
      expect(skills1.map((s) => s.name).sort()).toEqual(
        skills2.map((s) => s.name).sort()
      );
    });
  });
});

