/**
 * Skill-Aware Prompt Generation
 *
 * Generates context-aware prompts based on available skills and response content.
 * Enables users to discover powerful skill capabilities through suggested prompts.
 *
 * @see Story 7.7 - Skill-Aware Suggested Prompts
 * @see AC#1 - Skill hints in generated prompts
 * @see AC#2 - Response content triggers skill export prompts
 * @see AC#3 - Research/analysis suggests relevant skill outputs
 * @see AC#4 - Skills API metadata used in prompt generation
 * @see AC#5 - Skill follow-up prompts after skill usage
 */

import type { SuggestedPrompt, SkillInfo } from './prompt-factory.js';

/** Maximum skill prompts to return (blend with context prompts) */
const MAX_SKILL_PROMPTS = 2;

/**
 * Developer tools to exclude from user-facing prompts.
 * These are for development/admin purposes only.
 *
 * @see Story 7.7 Technical Note - excluded-skills
 */
export const EXCLUDED_SKILLS = new Set([
  'mcp-builder',
  'skill-creator',
  'webapp-testing',
  'web-artifacts-builder',
  'example',
]);

/**
 * Mapping of skill names to their suggested prompts.
 * Used for both skill hints and response-based suggestions.
 *
 * @see Story 7.7 AC#4 - Skills API metadata used in prompt generation
 */
export const SKILL_PROMPT_MAP: Record<string, SuggestedPrompt> = {
  xlsx: {
    title: 'Create spreadsheet',
    message: 'Create a spreadsheet with this data',
  },
  pdf: {
    title: 'Generate PDF',
    message: 'Generate a PDF report from this information',
  },
  docx: {
    title: 'Create document',
    message: 'Create a Word document with this content',
  },
  summarize: {
    title: 'Summarize thread',
    message: 'Summarize a conversation',
  },
  'd3js-visualization': {
    title: 'Visualize data',
    message: 'Create a visualization of this data',
  },
  'algorithmic-art': {
    title: 'Generate artwork',
    message: 'Generate visual artwork based on...',
  },
  'frontend-design': {
    title: 'Design UI',
    message: 'Design a UI mockup for...',
  },
};

/**
 * Response content patterns that trigger specific skill prompts.
 * Patterns are case-insensitive and use simple substring matching.
 */
interface ContentPattern {
  /** Keywords to match (case-insensitive) */
  patterns: string[];
  /** Regex pattern for numeric data detection */
  regex?: RegExp;
  /** Skill to suggest when pattern matches */
  skill: string;
  /** Prompt to show (overrides SKILL_PROMPT_MAP for context-specific messaging) */
  prompt: SuggestedPrompt;
}

/**
 * Content patterns for response-based skill suggestions.
 * @see Story 7.7 AC#2 - Response content triggers skill export prompts
 * @see Story 7.7 AC#3 - Research/analysis suggests relevant skill outputs
 */
const CONTENT_PATTERNS: ContentPattern[] = [
  // Data/table patterns -> xlsx
  {
    patterns: ['data', 'table', 'numbers', 'spreadsheet', 'columns', 'rows'],
    regex: /\d+.*\d+.*\d+/, // Multiple numbers suggest tabular data
    skill: 'xlsx',
    prompt: {
      title: 'Export to Excel',
      message: 'Export this data to a spreadsheet',
    },
  },
  // Research/analysis patterns -> pdf
  {
    patterns: ['research', 'analysis', 'findings', 'report', 'summary', 'conclusion'],
    skill: 'pdf',
    prompt: {
      title: 'Create PDF report',
      message: 'Create a PDF report from this analysis',
    },
  },
  // Visualization patterns -> d3js
  {
    patterns: ['trend', 'comparing', 'growth', 'chart', 'graph', 'over time', 'percentage', 'differences'],
    skill: 'd3js-visualization',
    prompt: {
      title: 'Visualize this',
      message: 'Create a visualization of this data',
    },
  },
  // Document patterns -> docx
  {
    patterns: ['document', 'draft', 'template', 'letter', 'memo'],
    skill: 'docx',
    prompt: {
      title: 'Create document',
      message: 'Create a Word document with this content',
    },
  },
];

/**
 * Follow-up prompts after using specific skills.
 * Shown when usedSkillInResponse matches a skill name.
 *
 * @see Story 7.7 AC#5 - Skill follow-up prompts after skill usage
 */
const SKILL_FOLLOW_UPS: Record<string, SuggestedPrompt[]> = {
  xlsx: [
    { title: 'Add a chart', message: 'Add a chart to visualize this data' },
    { title: 'Add formulas', message: 'Add calculation formulas to the spreadsheet' },
    { title: 'Format the sheet', message: 'Format the spreadsheet with better styling' },
    { title: 'Create another sheet', message: 'Create another spreadsheet with...' },
  ],
  pdf: [
    { title: 'Add sections', message: 'Add more sections to the PDF' },
    { title: 'Change style', message: 'Change the PDF style and formatting' },
    { title: 'Create summary', message: 'Create an executive summary' },
    { title: 'Export as docx', message: 'Export this as a Word document instead' },
  ],
  summarize: [
    { title: 'Another thread', message: 'Summarize another conversation thread' },
    { title: 'Export summary', message: 'Export this summary to a document' },
    { title: 'More detail', message: 'Expand on the key points in this summary' },
    { title: 'Action items', message: 'Extract action items from this conversation' },
  ],
  'd3js-visualization': [
    { title: 'Different chart type', message: 'Show this as a different chart type' },
    { title: 'Add more data', message: 'Add more data to the visualization' },
    { title: 'Export to PDF', message: 'Export this visualization to a PDF report' },
    { title: 'Create animation', message: 'Create an animated version of this visualization' },
  ],
  docx: [
    { title: 'Add sections', message: 'Add more sections to the document' },
    { title: 'Change formatting', message: 'Change the document formatting' },
    { title: 'Export as PDF', message: 'Export this document as a PDF' },
    { title: 'Create template', message: 'Save this as a template for future use' },
  ],
};

/**
 * Get skill-aware prompts based on available skills.
 * Returns prompts that hint at skill capabilities.
 *
 * @param skills - Available skills from skill registry
 * @returns Array of skill prompts (max 2)
 *
 * @see Story 7.7 AC#1 - Skill hints in generated prompts
 * @see Story 7.7 AC#4 - Skills API metadata used in prompt generation
 */
export function getSkillAwarePrompts(skills: SkillInfo[] | undefined): SuggestedPrompt[] {
  if (!skills || skills.length === 0) {
    return [];
  }

  const prompts: SuggestedPrompt[] = [];

  for (const skill of skills) {
    // Skip excluded developer tools
    if (EXCLUDED_SKILLS.has(skill.name)) {
      continue;
    }

    // Look up prompt for this skill
    const prompt = SKILL_PROMPT_MAP[skill.name];
    if (prompt) {
      prompts.push(prompt);
    }

    // Limit to MAX_SKILL_PROMPTS
    if (prompts.length >= MAX_SKILL_PROMPTS) {
      break;
    }
  }

  return prompts;
}

/**
 * Analyze response content and suggest relevant skill-based prompts.
 * Uses pattern matching to detect exportable data, research results, etc.
 *
 * @param responseContent - Text content of the response
 * @param availableSkillNames - Names of available skills
 * @returns Array of skill prompts based on content patterns (max 2)
 *
 * @see Story 7.7 AC#2 - Response content triggers skill export prompts
 * @see Story 7.7 AC#3 - Research/analysis suggests relevant skill outputs
 */
export function analyzeResponseForSkillPrompts(
  responseContent: string | undefined,
  availableSkillNames: string[]
): SuggestedPrompt[] {
  if (!responseContent || responseContent.length === 0) {
    return [];
  }

  const lowerText = responseContent.toLowerCase();
  const prompts: SuggestedPrompt[] = [];
  const suggestedSkills = new Set<string>();

  for (const pattern of CONTENT_PATTERNS) {
    // Skip if skill not available
    if (!availableSkillNames.includes(pattern.skill)) {
      continue;
    }

    // Skip if already suggested this skill
    if (suggestedSkills.has(pattern.skill)) {
      continue;
    }

    // Check keyword patterns
    const keywordMatch = pattern.patterns.some((p) => lowerText.includes(p));

    // Check regex pattern if present
    const regexMatch = pattern.regex ? pattern.regex.test(responseContent) : false;

    if (keywordMatch || regexMatch) {
      prompts.push(pattern.prompt);
      suggestedSkills.add(pattern.skill);

      // Limit to MAX_SKILL_PROMPTS
      if (prompts.length >= MAX_SKILL_PROMPTS) {
        break;
      }
    }
  }

  return prompts;
}

/**
 * Get follow-up prompts for a skill that was just used.
 * Provides contextual next actions after skill execution.
 *
 * @param usedSkill - Name of the skill that was used
 * @returns Array of follow-up prompts for the skill
 *
 * @see Story 7.7 AC#5 - Skill follow-up prompts after skill usage
 */
export function getSkillFollowUpPrompts(usedSkill: string | undefined): SuggestedPrompt[] {
  if (!usedSkill || usedSkill.length === 0) {
    return [];
  }

  return SKILL_FOLLOW_UPS[usedSkill] ?? [];
}
