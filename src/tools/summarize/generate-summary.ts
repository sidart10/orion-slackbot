/**
 * Summary Generation using Claude
 *
 * Generates structured summaries of conversations using the Anthropic API.
 * Uses Slack mrkdwn format (not markdown).
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#4 - Generate Structured Summary
 * @see AC#7 - Langfuse Observability
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/environment.js';
import { getLangfuse } from '../../observability/langfuse.js';

const anthropic = new Anthropic();

/**
 * Summarization prompt — outputs Slack mrkdwn format (not markdown).
 *
 * IMPORTANT: Use *bold* not **bold**, use _italic_ not *italic*.
 * @see Story 7.8 - Enhanced Slack UI Polish (AC6)
 * @see project-context.md Slack mrkdwn Reference
 */
export const SUMMARIZATION_PROMPT = `You are summarizing a Slack conversation. Output in Slack mrkdwn format.

IMPORTANT FORMATTING RULES:
- Bold: *text* (NOT **text**)
- Italic: _text_ (NOT *text*)
- Links: <https://url|display text>
- Lists: Use • for bullets

CITING SOURCES:
Messages are provided with clickable links in format: [Username](url): message
When referencing specific messages, topics, or decisions, link to the source like: <url|topic or quote>
For example: The team discussed <https://slack.com/...|infrastructure upgrades> and decided to proceed.

Analyze the messages and extract:

1. *Summary*: A 2-3 sentence overview with inline links to key messages
2. *Key Decisions*: Decisions made (link to the message where decided)
3. *Action Items*: Tasks assigned with owners (format: @person: task)
4. *Topics Discussed*: Primary subjects with links to relevant messages
5. *Unresolved Questions*: Open questions that weren't answered
6. *Active Participants*: Who contributed most

Format your response as:

*Summary*
[2-3 sentence overview with inline links to key messages]

*Key Decisions*
• <link|Decision 1>
• <link|Decision 2>

*Action Items*
• @[person]: [Task description]

*Topics Discussed*
• <link|Topic 1>: [Brief description]

*Unresolved Questions*
• [Question 1]

*Active Participants*
[Name 1], [Name 2], [Name 3]

If a section has no items, omit it entirely.
For large conversations, focus on the most significant items (max 5 per section).
IMPORTANT: Include inline links to source messages throughout your response.`;

export type SummaryType = 'thread' | 'channel' | 'mpim' | 'im' | 'public_channel' | 'private_channel';

/**
 * Generate summary using Claude.
 * Uses config.anthropic.model — never hardcoded.
 *
 * @param formattedMessages - Messages formatted as "[User]: message"
 * @param type - Type of conversation being summarized
 * @param traceId - Trace ID for observability
 * @returns Generated summary in Slack mrkdwn format
 *
 * @see AC#4 - Generate Structured Summary
 * @see AC#7 - Langfuse span: summarize.generate
 */
export async function generateSummary(
  formattedMessages: string,
  type: SummaryType,
  traceId: string
): Promise<string> {
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: 'summarize.generate',
    metadata: { traceId, type, messageLength: formattedMessages.length },
  });
  const span = trace?.span({
    name: 'summarize.generate',
    input: { type, messageLength: formattedMessages.length },
  });

  const response = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 2048,
    system: SUMMARIZATION_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Summarize this ${type} conversation:\n\n${formattedMessages}`,
      },
    ],
  });

  const summaryText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  span?.end({
    output: {
      summaryLength: summaryText.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });

  return summaryText;
}

