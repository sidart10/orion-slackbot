/**
 * Slack mrkdwn formatting utilities
 *
 * CRITICAL RULES (from architecture.md):
 * - AR21: Use *bold* NOT **bold**
 * - AR22: No blockquotes — use bullet points
 * - AR23: No emojis unless explicitly requested
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#3 - Streamed response uses Slack mrkdwn formatting
 * @see AC#4 - No blockquotes in responses
 * @see AC#5 - No emojis unless explicitly requested
 */

export interface FormatOptions {
  allowEmojis?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Convert standard markdown to Slack mrkdwn format
 *
 * Transformations applied:
 * 1. **bold** → *bold* (markdown to mrkdwn)
 * 2. *italic* → _italic_ (markdown to mrkdwn)
 * 3. > blockquote → • bullet (per AR22)
 * 4. Emoji removal (unless allowEmojis: true)
 *
 * @param text - Input text with markdown formatting
 * @param options - Formatting options
 * @returns Text formatted for Slack mrkdwn
 */
export function formatSlackMrkdwn(text: string, options: FormatOptions = {}): string {
  let formatted = text;

  // Step 1: Convert markdown italic (*text*) to mrkdwn (_text_) FIRST
  // Only match single asterisks not part of double asterisks
  // This must happen BEFORE bold conversion to avoid *bold* → _bold_
  formatted = formatted.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '_$1_');

  // Step 2: Convert markdown bold (**text**) to mrkdwn (*text*)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // Step 3: Remove blockquotes (> at start of line) — replace with bullet + keep spacing
  formatted = formatted.replace(/^>([ \t]*)/gm, '•$1');

  // Step 4: Strip emojis unless explicitly allowed (AR23)
  if (!options.allowEmojis) {
    formatted = stripEmojis(formatted);
  }

  return formatted;
}

/**
 * Strip emoji characters from text
 * Preserves Slack emoji shortcodes like :smile: as those may be intentional
 *
 * @param text - Input text
 * @returns Text with unicode emojis removed
 */
export function stripEmojis(text: string): string {
  // Comprehensive emoji regex covering:
  // - Emoticons (U+1F600-1F64F)
  // - Miscellaneous Symbols and Pictographs (U+1F300-1F5FF)
  // - Transport and Map Symbols (U+1F680-1F6FF)
  // - Regional Indicator Symbols (U+1F1E0-1F1FF)
  // - Supplemental Symbols and Pictographs (U+1F900-1F9FF)
  // - Miscellaneous Symbols (U+2600-26FF)
  // - Dingbats (U+2700-27BF)
  // - Variation selectors (U+FE00-FE0F)
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu;
  return text.replace(emojiRegex, '');
}

/**
 * Validate that text conforms to Slack mrkdwn requirements
 *
 * @param text - Text to validate
 * @returns Validation result with any issues found
 */
export function validateSlackFormat(text: string): ValidationResult {
  const issues: string[] = [];

  // Check for markdown bold (should be mrkdwn)
  if (/\*\*[^*]+\*\*/.test(text)) {
    issues.push('Contains markdown bold (**text**) instead of mrkdwn (*text*)');
  }

  // Check for blockquotes
  if (/^>/m.test(text)) {
    issues.push('Contains blockquotes (not allowed per AR22)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

