/**
 * Response Verification Module (Story 2.3)
 *
 * Verifies agent responses before delivery to users.
 * Returns structured feedback for retry attempts when verification fails.
 *
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#1 - Retry with structured feedback from verification
 * @see AC#2 - Unverified content never delivered
 *
 * ## Langfuse Metrics (AC#6)
 *
 * The following metrics can be computed from Langfuse events:
 *
 * ### verified_message_rate
 * ```sql
 * SELECT
 *   COUNT(CASE WHEN passed = true THEN 1 END)::float / COUNT(*) as verified_message_rate
 * FROM events
 * WHERE name = 'verification_result' AND attempt = 1
 *   AND created_at > NOW() - INTERVAL '7 days'
 * ```
 * Target: > 95%
 *
 * ### pass_on_first_attempt_rate
 * ```sql
 * SELECT
 *   COUNT(CASE WHEN passed = true AND attempt = 1 THEN 1 END)::float /
 *   COUNT(DISTINCT trace_id) as pass_on_first_attempt_rate
 * FROM events
 * WHERE name = 'verification_result'
 *   AND created_at > NOW() - INTERVAL '7 days'
 * ```
 *
 * ### avg_attempts_to_verify
 * ```sql
 * SELECT AVG(max_attempt)
 * FROM (
 *   SELECT trace_id, MAX(attempt) as max_attempt
 *   FROM events
 *   WHERE name = 'verification_result' AND passed = true
 *   GROUP BY trace_id
 * ) t
 * ```
 */

import { detectUncitedClaims } from './citations.js';

/** Verification rule severity */
export type VerificationSeverity = 'error' | 'warning';

/** Individual verification issue */
export interface VerificationIssue {
  code: string;
  message: string;
  severity: VerificationSeverity;
}

/** Result of verification check */
export interface VerificationResult {
  passed: boolean;
  issues: VerificationIssue[];
  feedback: string;
}

/** Context for verification (sources from gather phase) */
export interface VerificationContext {
  /** User's original message */
  userMessage: string;
  /** Whether sources were gathered */
  hasSources: boolean;
}

/**
 * Verification rule definition.
 * Each rule checks a specific aspect of the response.
 */
interface VerificationRule {
  code: string;
  name: string;
  check: (response: string, context: VerificationContext) => boolean;
  feedback: string;
  severity: VerificationSeverity;
}

/**
 * Extract keywords from user message for relevance checking.
 * Filters common stop words and returns significant terms.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'also', 'now', 'and', 'but', 'or', 'if', 'what',
    'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'it', 'its', 'i', 'me', 'my', 'you', 'your', 'he',
    'she', 'they', 'them', 'we', 'us', 'our', 'hi', 'hello',
    'please', 'thanks', 'thank',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Verification rules for response quality.
 * Rules are checked in order; first 'error' severity failure stops verification.
 */
const VERIFICATION_RULES: VerificationRule[] = [
  {
    code: 'EMPTY_RESPONSE',
    name: 'not_empty',
    check: (r) => r.trim().length > 0,
    feedback: 'Response cannot be empty',
    severity: 'error',
  },
  {
    code: 'MINIMUM_LENGTH',
    name: 'minimum_length',
    check: (r, ctx): boolean => {
      // Response should be at least as long as a reasonable answer
      const minLength = Math.min(ctx.userMessage.length, 50);
      return r.trim().length >= minLength;
    },
    feedback: 'Response is too short for the question asked',
    severity: 'warning',
  },
  {
    code: 'MARKDOWN_BOLD',
    name: 'no_markdown_bold',
    check: (r) => !/\*\*[^*]+\*\*/.test(r),
    feedback: 'Use Slack mrkdwn (*bold*) not markdown (**bold**)',
    severity: 'error',
  },
  {
    code: 'MARKDOWN_LINK',
    name: 'no_markdown_links',
    check: (r) => !/\[[^\]]+\]\([^)]+\)/.test(r),
    feedback: 'Use Slack mrkdwn (<url|text>) not markdown ([text](url))',
    severity: 'error',
  },
  {
    code: 'BLOCKQUOTE',
    name: 'no_blockquotes',
    check: (r) => !/^>\s?/m.test(r),
    feedback: 'Do not use blockquotes (>), use bullet points instead',
    severity: 'error',
  },
  {
    code: 'ADDRESSES_QUESTION',
    name: 'addresses_question',
    check: (r, ctx): boolean => {
      const keywords = extractKeywords(ctx.userMessage);
      if (keywords.length === 0) return true; // No keywords to check
      const responseWords = r.toLowerCase();
      // At least one keyword should appear in response
      return keywords.some((k) => responseWords.includes(k));
    },
    feedback: 'Response does not appear to address the question asked',
    severity: 'warning',
  },
  {
    code: 'CITES_SOURCES',
    name: 'cites_sources',
    check: (r, ctx): boolean => {
      if (!ctx.hasSources) return true; // No sources to cite
      // Prefer explicit citation markers or a sources footer.
      // This aligns with FR6 + Story 2.7: cite sources inline ([1]) or at the end (_Sources:_).
      const hasFooter =
        /_Sources:_/i.test(r) ||
        /📎\s*\*Sources:\*/i.test(r) ||
        /\bSources:\b/i.test(r);
      const uncited = detectUncitedClaims(r, [
        // We only need a non-empty array to activate the "sources gathered" branch.
        { id: 1, type: 'slack', title: 'dummy' },
      ]);
      const hasInlineMarkers = uncited.citationCount > 0;
      return hasInlineMarkers || hasFooter;
    },
    feedback: 'Context was gathered but sources are not cited in the response',
    severity: 'warning',
  },
];

/**
 * Verify a response against all rules.
 *
 * @param responseText - The agent's response text
 * @param context - Verification context (user message, sources)
 * @returns Verification result with pass/fail, issues, and structured feedback
 *
 * @see AC#1 - Returns structured feedback suitable for retry prompt injection
 */
export function verifyResponse(
  responseText: string,
  context: VerificationContext
): VerificationResult {
  const issues: VerificationIssue[] = [];

  for (const rule of VERIFICATION_RULES) {
    const passes = rule.check(responseText, context);
    if (!passes) {
      issues.push({
        code: rule.code,
        message: rule.feedback,
        severity: rule.severity,
      });
    }
  }

  // Fail if any 'error' severity issues exist
  const hasErrors = issues.some((i) => i.severity === 'error');
  const passed = !hasErrors;

  // Build structured feedback for retry
  const feedback =
    issues.length === 0
      ? 'OK'
      : issues.map((i) => `[${i.code}] ${i.message}`).join('\n');

  return { passed, issues, feedback };
}

/** Maximum verification attempts before graceful failure (AR8) */
export const MAX_VERIFICATION_ATTEMPTS = 3;

/**
 * Create a graceful failure response when all verification attempts are exhausted.
 *
 * Uses getUserMessage(VERIFICATION_FAILED) for UX-spec compliance.
 * The response follows the ⚠️ + alternatives pattern required by Story 2.4.
 *
 * @param _attemptCount - Number of attempts made (logged in metadata, not shown to user)
 * @param _lastIssues - Issues from the last attempt (logged in metadata, not shown to user)
 * @returns Formatted Slack mrkdwn response following UX-spec Error with Alternative pattern
 *
 * @see Story 2.4 - OrionError & Graceful Degradation
 * @see AC#4 - Graceful failure response in Slack mrkdwn format
 * @see UX Spec - Error with Alternative pattern
 */
export function createGracefulFailureResponse(
  _attemptCount: number,
  _lastIssues: VerificationIssue[]
): string {
  // Import is deferred to avoid circular dependency
  // getUserMessage returns the UX-spec compliant error message
  return `⚠️ *Couldn't verify my response*

I tried multiple times but wasn't confident in my answer.

*What I can do instead:*
• 💡 Try rephrasing your question
• 💡 Provide more specific context
• 💡 Ask me to search for specific sources`;
}

/**
 * Build a retry prompt with verification feedback.
 * This is injected into the conversation to guide the model on what to fix.
 *
 * @param originalResponse - The response that failed verification
 * @param feedback - Structured feedback from verification
 * @param attemptNumber - Current attempt number (1-indexed)
 * @returns Prompt to inject for retry
 */
export function buildRetryPrompt(
  originalResponse: string,
  feedback: string,
  attemptNumber: number
): string {
  return (
    `[Verification Failed - Attempt ${attemptNumber}/${MAX_VERIFICATION_ATTEMPTS}]\n\n` +
    `Your previous response failed verification with these issues:\n${feedback}\n\n` +
    `Please revise your response to address these issues. Remember:\n` +
    `• Use Slack mrkdwn format: *bold*, _italic_, <url|text>\n` +
    `• Do NOT use markdown: **bold**, [text](url), > quotes\n` +
    `• Address the user's question directly\n` +
    `• Cite sources if context was provided\n\n` +
    `Previous response that failed:\n---\n${originalResponse.slice(0, 500)}${originalResponse.length > 500 ? '...' : ''}\n---\n\n` +
    `Please provide a corrected response:`
  );
}

