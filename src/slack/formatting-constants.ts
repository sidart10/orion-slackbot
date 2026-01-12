/**
 * Formatting constants for Slack responses.
 * Centralized to ensure consistency across all formatters.
 *
 * IMPORTANT: Slack uses mrkdwn format, NOT Markdown.
 * - Bold: *text* (NOT **text**)
 * - Italic: _text_ (NOT *text*)
 * - Links: <https://url|text> (NOT [text](url))
 *
 * @see Story 7.8 - Enhanced Slack UI Polish
 * @see project-context.md - Slack mrkdwn Reference
 */

/**
 * Status indicators for system messages.
 * Per AC2: Only allowed emojis for status indicators.
 * These are for status messages only, NOT section headers.
 *
 * INTENTIONAL DESIGN: All values are empty strings.
 * Per Story 7.8 AC2 and stakeholder feedback:
 * - Professional appearance prioritized over emoji decoration
 * - Functional text (e.g., "Warning:", error messages) provides clarity without emojis
 * - Empty strings allow future emoji additions via config without code changes
 * - Centralizing here (even as empty) enables consistent auditing of emoji usage
 *
 * If emojis are later desired, change values here and all consumers update automatically.
 */
export const STATUS_EMOJI = {
  /** Searching/loading indicator - empty for clean UI */
  searching: '',
  /** Success/completion indicator - empty for clean UI */
  success: '',
  /** Warning indicator - empty; text conveys warning clearly */
  warning: '',
  /** Error indicator - empty; error text is sufficient */
  error: '',
  /** Tip/hint indicator - empty for clean UI */
  tip: '',
} as const;

/**
 * Standard section headers for Slack responses.
 * All headers use Slack mrkdwn bold format: *Header Name*
 *
 * Per AC1/AC2:
 * - Uses *bold* format (NOT **bold** markdown)
 * - No emoji prefixes (removed per stakeholder feedback)
 * - Title Case for all headers
 *
 * Per AC3: Centralized constants for all formatters to import.
 */
export const SECTION_HEADERS = {
  /** Summary section - 2-3 sentence overview */
  summary: '*Summary*',
  /** Key findings from research/analysis */
  keyFindings: '*Key Findings*',
  /** Decisions made in conversation */
  keyDecisions: '*Key Decisions*',
  /** Action items with owners */
  actionItems: '*Action Items*',
  /** Topics discussed in conversation */
  topicsDiscussed: '*Topics Discussed*',
  /** Questions that weren't answered */
  unresolvedQuestions: '*Unresolved Questions*',
  /** Active participants in conversation */
  participants: '*Active Participants*',
  /** References/sources section (with colon for list introduction) */
  references: '*References:*',
  /** Next steps section */
  nextSteps: '*Next Steps*',
  /** Error message header */
  error: '*Error*',
  /** Alternative suggestions */
  alternatives: '*Alternatives*',
} as const;

/**
 * Response structure order per UX spec.
 * Per AC4: All handlers use consistent response structure.
 *
 * 1. value - Lead with the answer/result first
 * 2. details - Supporting details (bulleted)
 * 3. references - References section (if sources exist)
 * 4. actions - Feedback prompt / actions (if applicable)
 */
export const RESPONSE_STRUCTURE = [
  'value',
  'details',
  'references',
  'actions',
] as const;

/** Type for section header keys */
export type SectionHeaderKey = keyof typeof SECTION_HEADERS;

/** Type for status emoji keys */
export type StatusEmojiKey = keyof typeof STATUS_EMOJI;

/** Type for response structure positions */
export type ResponseStructurePosition = (typeof RESPONSE_STRUCTURE)[number];
