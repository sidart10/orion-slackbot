/**
 * Verify phase: produce a structured result describing whether the response is acceptable.
 *
 * Retry mechanics are implemented in Story 2.3; this module provides the contract.
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#5 - Verification result produced and logged to Langfuse trace
 */

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  feedback: string;
}

/**
 * Minimal verification checks (MVP):
 * - Non-empty response
 * - Avoid Markdown bold (**bold**) (Slack mrkdwn uses *bold*)
 * - Avoid Markdown links [text](url) (Slack uses <url|text>)
 * - Avoid blockquote syntax (lines starting with ">")
 */
export function verify(responseText: string): VerificationResult {
  const issues: string[] = [];
  const trimmed = responseText.trim();

  if (trimmed.length === 0) {
    issues.push('Response was empty.');
  }

  if (/\*\*[^*]+\*\*/.test(responseText)) {
    issues.push('Slack formatting: avoid Markdown bold (**bold**); use *bold* instead.');
  }

  if (/\[[^\]]+\]\([^)]+\)/.test(responseText)) {
    issues.push('Slack formatting: avoid Markdown links [text](url); use <url|text> instead.');
  }

  if (/^>\s?/m.test(responseText)) {
    issues.push('Slack formatting: avoid blockquotes (lines starting with ">").');
  }

  return {
    passed: issues.length === 0,
    issues,
    feedback: issues.length === 0 ? 'OK' : issues.join(' '),
  };
}


