/**
 * Prompt Factory for Dynamic Suggested Prompts
 *
 * Generates context-aware suggested prompts for Slack's setSuggestedPrompts API.
 * Per UX spec: prompts should never be static, always relevant to context.
 *
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see Story 7.7 - Skill-Aware Suggested Prompts
 * @see AC#1 - Context-aware prompts (channel, user, time)
 * @see AC#2 - Follow-up prompts after responses
 * @see AC#4 - Error recovery prompts
 * @see AC#5 - Maximum 4 prompts (Slack API limit)
 */

import {
  getSkillAwarePrompts,
  analyzeResponseForSkillPrompts,
  getSkillFollowUpPrompts,
} from './skill-prompts.js';

/**
 * Prompt structure matching Slack's setSuggestedPrompts API
 */
export interface SuggestedPrompt {
  /** Short button text (max ~25 chars) */
  title: string;
  /** Full message sent when clicked */
  message: string;
}

/**
 * Context for generating suggested prompts
 */
export interface PromptContext {
  /** Channel type: 'im' for DMs, 'channel' or 'group' for public/private channels */
  channelType: 'im' | 'channel' | 'group';
  /** Slack user ID */
  userId: string;
  /** Optional channel ID for channel-specific prompts */
  channelId?: string;
  /** Thread history for context-aware suggestions */
  threadHistory?: string[];
  /** Type of the last response to generate follow-up prompts */
  lastResponseType?: 'research' | 'action' | 'error' | 'clarification';
  /** Error code if lastResponseType is 'error' */
  errorCode?: string;
  /** Hour of day (0-23) for time-based prompts. Uses current hour if not provided. */
  hourOfDay?: number;

  // Story 7.7: Skill-aware prompts
  /** Available skills from skill registry (SkillRegistryEntry objects) */
  availableSkills?: SkillInfo[];
  /** Content of the last response for pattern-based skill suggestions */
  responseContent?: string;
  /** Skill that was used in the most recent response (triggers follow-up prompts) */
  usedSkillInResponse?: string;
  /** Skills that have been used throughout the thread (for progressive suggestions) */
  usedSkillsInThread?: string[];
}

/**
 * Minimal skill info for prompt generation.
 * Subset of SkillRegistryEntry to avoid circular dependencies.
 * @see Story 7.7 - AC#4 - Skills API metadata used in prompt generation
 */
export interface SkillInfo {
  /** Local skill name (e.g., "summarize", "xlsx") */
  name: string;
  /** Anthropic skill ID */
  skillId: string;
  /** Skill type */
  type: 'custom' | 'anthropic';
  /** Version */
  version: string;
}

/** Slack API limit for suggested prompts */
const MAX_PROMPTS = 4;

/**
 * Generate context-aware suggested prompts.
 * Per UX spec: Never static, always relevant.
 *
 * Priority order (Story 7.7):
 * 1. usedSkillInResponse (highest - show skill follow-ups)
 * 2. lastResponseType (existing behavior)
 * 3. responseContent + skills (content analysis)
 * 4. availableSkills only (general hints)
 * 5. Time-based/base prompts (lowest)
 *
 * @param context - Context for generating prompts
 * @returns Array of suggested prompts (max 4)
 *
 * @see Story 7.7 - Skill-aware prompts integration
 */
export function generateSuggestedPrompts(context: PromptContext): SuggestedPrompt[] {
  let prompts: SuggestedPrompt[];

  // Priority 1: Skill follow-ups if a skill was just used (AC#5)
  if (context.usedSkillInResponse) {
    const skillFollowUps = getSkillFollowUpPrompts(context.usedSkillInResponse);
    if (skillFollowUps.length > 0) {
      return skillFollowUps.slice(0, MAX_PROMPTS);
    }
  }

  // Priority 2: Response type follow-ups (existing behavior)
  if (context.lastResponseType) {
    switch (context.lastResponseType) {
      case 'research':
        prompts = getResearchFollowUpPrompts();
        break;
      case 'action':
        prompts = getActionFollowUpPrompts();
        break;
      case 'error':
        prompts = getErrorRecoveryPrompts(context.errorCode);
        break;
      case 'clarification':
        prompts = getClarificationFollowUpPrompts();
        break;
      default:
        prompts = getBasePrompts(context.channelType);
    }
    // Blend skill prompts with response type prompts
    return blendWithSkillPrompts(prompts, context);
  }

  // Priority 3 & 4: Response content analysis + available skills (AC#2, AC#3)
  const availableSkillNames = (context.availableSkills ?? []).map((s) => s.name);
  if (context.responseContent && availableSkillNames.length > 0) {
    const contentPrompts = analyzeResponseForSkillPrompts(
      context.responseContent,
      availableSkillNames
    );
    if (contentPrompts.length > 0) {
      // Fill remaining slots with base prompts
      const basePrompts = getBasePrompts(context.channelType);
      const combined = [...contentPrompts, ...basePrompts];
      return combined.slice(0, MAX_PROMPTS);
    }
  }

  // Priority 4: Available skills hints (AC#1)
  if (context.availableSkills && context.availableSkills.length > 0) {
    const skillPrompts = getSkillAwarePrompts(context.availableSkills);
    if (skillPrompts.length > 0) {
      // Blend with time-based or base prompts
      const hour = context.hourOfDay ?? new Date().getHours();
      const timePrompts = getTimeBasedPrompts(hour, context.channelType);
      const basePrompts = timePrompts ?? getBasePrompts(context.channelType);
      // Put skill prompts first, then fill with base
      const combined = [...skillPrompts, ...basePrompts];
      return combined.slice(0, MAX_PROMPTS);
    }
  }

  // Priority 5: Time-based or base prompts (lowest)
  const hour = context.hourOfDay ?? new Date().getHours();
  const timePrompts = getTimeBasedPrompts(hour, context.channelType);

  if (timePrompts) {
    prompts = timePrompts;
  } else {
    prompts = getBasePrompts(context.channelType);
  }

  // Enforce Slack API limit
  return prompts.slice(0, MAX_PROMPTS);
}

/**
 * Blend base prompts with skill-aware prompts.
 * Replaces 1-2 base prompts with skill prompts when available.
 *
 * @param basePrompts - Original prompts to blend with
 * @param context - Context containing skill info
 * @returns Blended prompts (max 4)
 *
 * @see Story 7.7 AC#1 - At least one skill hint when skills available
 */
function blendWithSkillPrompts(
  basePrompts: SuggestedPrompt[],
  context: PromptContext
): SuggestedPrompt[] {
  const availableSkillNames = (context.availableSkills ?? []).map((s) => s.name);

  // Try content-based prompts first
  let skillPrompts: SuggestedPrompt[] = [];
  if (context.responseContent && availableSkillNames.length > 0) {
    skillPrompts = analyzeResponseForSkillPrompts(
      context.responseContent,
      availableSkillNames
    );
  }

  // Fall back to general skill hints
  if (skillPrompts.length === 0 && context.availableSkills) {
    skillPrompts = getSkillAwarePrompts(context.availableSkills);
  }

  if (skillPrompts.length === 0) {
    return basePrompts.slice(0, MAX_PROMPTS);
  }

  // Blend: skill prompts first, then remaining base prompts
  const remainingSlots = MAX_PROMPTS - skillPrompts.length;
  const combined = [...skillPrompts, ...basePrompts.slice(0, remainingSlots)];
  return combined.slice(0, MAX_PROMPTS);
}

/**
 * Get time-based prompts for specific times of day.
 * Returns null if no special time-based prompts apply.
 *
 * @param hour - Hour of day (0-23)
 * @param channelType - Channel type for context
 * @returns Time-based prompts or null
 */
function getTimeBasedPrompts(
  hour: number,
  channelType: PromptContext['channelType']
): SuggestedPrompt[] | null {
  // Morning prompts (7-10 AM) - standup time
  if (hour >= 7 && hour <= 10) {
    if (channelType === 'im') {
      return [
        {
          title: "Plan today's tasks",
          message: 'Help me plan my priorities for today',
        },
        {
          title: 'Morning briefing',
          message: 'Give me a quick briefing on...',
        },
        {
          title: 'Research a topic',
          message: 'Research the latest developments in...',
        },
        {
          title: 'Draft a message',
          message: 'Help me draft a message about...',
        },
      ];
    }
    // Channel context: standup-focused
    return [
      {
        title: 'Standup summary',
        message: "Summarize yesterday's activity in this channel",
      },
      {
        title: "Today's priorities",
        message: 'What should the team focus on today based on recent discussions?',
      },
      {
        title: 'Research for the team',
        message: 'Research...',
      },
      {
        title: 'Find blockers',
        message: 'Are there any blockers mentioned recently?',
      },
    ];
  }

  // EOD prompts (4-7 PM) - wrap-up time
  if (hour >= 16 && hour <= 19) {
    if (channelType === 'im') {
      return [
        {
          title: "Today's summary",
          message: 'Summarize what I accomplished today',
        },
        {
          title: 'Plan for tomorrow',
          message: 'Help me plan priorities for tomorrow',
        },
        {
          title: 'Wrap up loose ends',
          message: 'What tasks should I close out today?',
        },
        {
          title: 'Quick research',
          message: 'Research...',
        },
      ];
    }
    // Channel context: EOD summary
    return [
      {
        title: 'Daily summary',
        message: "Summarize today's discussion in this thread",
      },
      {
        title: 'Action items',
        message: 'What action items were mentioned today?',
      },
      {
        title: 'Tomorrow prep',
        message: 'What should we prepare for tomorrow?',
      },
      {
        title: 'Research update',
        message: 'Research...',
      },
    ];
  }

  // No special time-based prompts for other hours
  return null;
}

/**
 * Get base prompts based on channel type.
 * DMs get personal assistance prompts, channels get team collaboration prompts.
 */
function getBasePrompts(channelType: PromptContext['channelType']): SuggestedPrompt[] {
  if (channelType === 'im') {
    // DM context: personal assistance
    return [
      {
        title: 'Research a topic',
        message: 'Research the latest developments in...',
      },
      {
        title: 'Summarize a thread',
        message: 'Summarize the conversation in #channel',
      },
      {
        title: 'Find documentation',
        message: 'Find our documentation about...',
      },
      {
        title: 'Help with a task',
        message: 'Help me draft a...',
      },
    ];
  }

  // Channel or group context: team collaboration
  return [
    {
      title: 'Summarize this thread',
      message: 'Summarize this conversation',
    },
    {
      title: 'Research for the team',
      message: 'Research...',
    },
    {
      title: 'Find related docs',
      message: 'Find documentation about...',
    },
    {
      title: 'Answer a question',
      message: 'What is our policy on...',
    },
  ];
}

/**
 * Get follow-up prompts after a research response.
 * Offers deeper exploration of the topic.
 */
function getResearchFollowUpPrompts(): SuggestedPrompt[] {
  return [
    {
      title: 'Dig deeper',
      message: 'Dig deeper into the key findings',
    },
    {
      title: 'Compare options',
      message: 'Compare the alternatives you found',
    },
    {
      title: 'Create a summary',
      message: 'Create a summary I can share with my team',
    },
    {
      title: 'Find more sources',
      message: 'Find additional sources on this topic',
    },
  ];
}

/**
 * Get follow-up prompts after an action response.
 * Offers status checks and adjustments.
 */
function getActionFollowUpPrompts(): SuggestedPrompt[] {
  return [
    {
      title: 'Check status',
      message: 'Check the status of what you just did',
    },
    {
      title: 'Make adjustments',
      message: 'Make the following adjustments...',
    },
    {
      title: 'Do something similar',
      message: 'Do the same thing for...',
    },
    {
      title: 'Undo or rollback',
      message: 'Can you undo that?',
    },
  ];
}

/**
 * Get error recovery prompts.
 * Offers alternatives based on what failed.
 */
function getErrorRecoveryPrompts(_errorCode?: string): SuggestedPrompt[] {
  // Future: customize prompts based on specific error codes
  // For now, return general recovery prompts
  return [
    {
      title: 'Try again',
      message: 'Try that again',
    },
    {
      title: 'Different approach',
      message: 'Try a different approach to...',
    },
    {
      title: 'Simplify request',
      message: 'Let me simplify: ...',
    },
    {
      title: 'What can you do?',
      message: 'What can you help me with?',
    },
  ];
}

/**
 * Get follow-up prompts after a clarification response.
 * Helps user provide more context.
 */
function getClarificationFollowUpPrompts(): SuggestedPrompt[] {
  return [
    {
      title: 'Provide more context',
      message: "Here's more context: ...",
    },
    {
      title: 'Choose an option',
      message: "I'd like option...",
    },
    {
      title: 'Start fresh',
      message: 'Let me start over. I want to...',
    },
    {
      title: 'What can you do?',
      message: 'What can you help me with?',
    },
  ];
}

// =============================================================================
// Story 7.7: Skill Integration Helpers
// =============================================================================

import { skillRegistry } from '../../skills/index.js';
import type { SkillRegistryEntry } from '../../skills/types.js';

/**
 * Get available skills from the registry as SkillInfo for prompt generation.
 *
 * Fetches all registered skills (both custom and built-in) and maps them
 * to the minimal SkillInfo interface needed for prompt generation.
 *
 * @returns Array of available skills as SkillInfo
 *
 * @see Story 7.7 AC#4 - Skills API metadata used in prompt generation
 */
export function getAvailableSkillsForPrompts(): SkillInfo[] {
  // Ensure registry is initialized (idempotent)
  skillRegistry.initialize();

  const skills: SkillInfo[] = [];
  const allSkillIds = skillRegistry.getAllSkillIds();

  for (const skillId of allSkillIds) {
    const entry: SkillRegistryEntry | undefined = skillRegistry.getSkillMetadata(skillId);
    if (entry) {
      skills.push({
        name: entry.name,
        skillId: entry.skillId,
        type: entry.type,
        version: entry.version,
      });
    }
  }

  return skills;
}

/**
 * Keywords in response content that suggest skill usage.
 * Maps keyword patterns to likely skill names.
 */
const SKILL_USAGE_PATTERNS: Array<{ patterns: RegExp; skill: string }> = [
  { patterns: /spreadsheet|excel|\.xlsx/i, skill: 'xlsx' },
  { patterns: /pdf|document report|\.pdf/i, skill: 'pdf' },
  { patterns: /word document|\.docx/i, skill: 'docx' },
  { patterns: /visualization|chart|graph/i, skill: 'd3js-visualization' },
  { patterns: /summariz(e|ed|ing)|thread summary/i, skill: 'summarize' },
];

/**
 * Detect which skill was used based on response content and file generation.
 *
 * Uses multiple heuristics:
 * 1. File generation (strongest signal - AgentResult.generatedFileIds present)
 * 2. Response content patterns (keywords suggesting skill output)
 *
 * @param responseContent - Full text content of the response
 * @param generatedFileIds - File IDs from AgentResult (indicates skill created files)
 * @returns Name of the skill that was likely used, or undefined if none detected
 *
 * @see Story 7.7 AC#5 - Skill follow-up prompts after skill usage
 */
export function detectSkillUsage(
  responseContent: string | undefined,
  generatedFileIds?: string[]
): string | undefined {
  // Priority 1: If files were generated, it's very likely a file-generating skill
  if (generatedFileIds && generatedFileIds.length > 0) {
    // Check response content to determine which file-generating skill
    if (responseContent) {
      const lowerContent = responseContent.toLowerCase();

      // Check explicit mentions
      if (lowerContent.includes('spreadsheet') || lowerContent.includes('xlsx') || lowerContent.includes('excel')) {
        return 'xlsx';
      }
      if (lowerContent.includes('pdf') && !lowerContent.includes('word')) {
        return 'pdf';
      }
      if (lowerContent.includes('word document') || lowerContent.includes('docx')) {
        return 'docx';
      }
      if (lowerContent.includes('visualization') || lowerContent.includes('chart')) {
        return 'd3js-visualization';
      }
      if (lowerContent.includes('artwork') || lowerContent.includes('art')) {
        return 'algorithmic-art';
      }
    }

    // Default to xlsx for unknown file generation (most common)
    return 'xlsx';
  }

  // Priority 2: Check response content patterns
  if (responseContent && responseContent.length > 50) {
    for (const { patterns, skill } of SKILL_USAGE_PATTERNS) {
      if (patterns.test(responseContent)) {
        return skill;
      }
    }
  }

  return undefined;
}

