/**
 * Prompt Factory for Dynamic Suggested Prompts
 *
 * Generates context-aware suggested prompts for Slack's setSuggestedPrompts API.
 * Per UX spec: prompts should never be static, always relevant to context.
 *
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see AC#1 - Context-aware prompts (channel, user, time)
 * @see AC#2 - Follow-up prompts after responses
 * @see AC#4 - Error recovery prompts
 * @see AC#5 - Maximum 4 prompts (Slack API limit)
 */

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
}

/** Slack API limit for suggested prompts */
const MAX_PROMPTS = 4;

/**
 * Generate context-aware suggested prompts.
 * Per UX spec: Never static, always relevant.
 *
 * @param context - Context for generating prompts
 * @returns Array of suggested prompts (max 4)
 */
export function generateSuggestedPrompts(context: PromptContext): SuggestedPrompt[] {
  let prompts: SuggestedPrompt[];

  // If we have a response type, generate follow-up prompts
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
  } else {
    // No response type: check for time-based prompts first, then base prompts
    const hour = context.hourOfDay ?? new Date().getHours();
    const timePrompts = getTimeBasedPrompts(hour, context.channelType);

    if (timePrompts) {
      prompts = timePrompts;
    } else {
      prompts = getBasePrompts(context.channelType);
    }
  }

  // Enforce Slack API limit
  return prompts.slice(0, MAX_PROMPTS);
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

