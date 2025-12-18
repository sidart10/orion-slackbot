/**
 * Agent Loop Module
 *
 * Implements the canonical agent loop pattern: Gather → Act → Verify
 * All agent implementations MUST follow this pattern (AR7).
 * Maximum 3 verification attempts before graceful failure (AR8).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#1 - Agent loop executes: Gather Context → Take Action → Verify Work
 * @see AC#2 - Gather phase searches available context
 * @see AC#3 - Act phase generates response based on gathered context
 * @see AC#4 - Verify phase checks response for accuracy
 * @see AC#5 - Each phase is logged as a span within the Langfuse trace
 */

import { createSpan } from '../observability/tracing.js';
import { logger } from '../utils/logger.js';
import { trackVerification } from '../observability/metrics.js';
import type { LangfuseTrace } from '../observability/langfuse.js';

/** Maximum verification attempts before graceful failure (AR8) */
export const MAX_ATTEMPTS = 3;

/**
 * Context for agent execution within a Slack thread
 */
export interface AgentContext {
  /** Slack user ID */
  userId: string;
  /** Slack channel ID */
  channelId: string;
  /** Thread timestamp */
  threadTs: string;
  /** Previous messages in the thread */
  threadHistory: string[];
  /** Langfuse trace ID for observability */
  traceId?: string;
  /** Feedback from previous verification attempt */
  verificationFeedback?: string;
  /** Current attempt number (1-indexed) */
  attemptNumber?: number;
  /** Issue count from previous verification attempt (for tracking improvement) */
  previousIssueCount?: number;
}

/**
 * Response from the agent loop
 */
export interface AgentResponse {
  /** The generated response content */
  content: string;
  /** Sources consulted for the response */
  sources: Source[];
  /** Whether the response passed verification */
  verified: boolean;
  /** Number of attempts made */
  attemptCount: number;
}

/**
 * A source of information used in the response
 */
export interface Source {
  /** Type of source */
  type: 'thread' | 'file' | 'web' | 'tool';
  /** Reference identifier */
  reference: string;
  /** Excerpt from the source */
  excerpt?: string;
}

/**
 * Severity of a verification issue
 */
export type VerificationSeverity = 'error' | 'warning';

/**
 * A structured verification issue with rule name, severity, and feedback
 */
export interface VerificationIssue {
  /** Name of the rule that failed */
  rule: string;
  /** Severity of the issue */
  severity: VerificationSeverity;
  /** Human-readable feedback for improvement */
  feedback: string;
}

/**
 * Result of response verification
 */
export interface VerificationResult {
  /** Whether verification passed */
  passed: boolean;
  /** Feedback for improvement */
  feedback: string;
  /** List of structured issues found */
  issues: VerificationIssue[];
}

/**
 * A verification rule with check function and metadata
 */
export interface VerificationRule {
  /** Unique rule name */
  name: string;
  /** Check function returning true if rule passes */
  check: (response: string, input: string, context: GatheredContext) => boolean;
  /** Feedback message when rule fails */
  feedback: string;
  /** Severity of rule violation */
  severity: VerificationSeverity;
}

/**
 * Context gathered during the gather phase
 */
export interface GatheredContext {
  /** Relevant thread messages */
  threadContext: string[];
  /** Relevant file contents */
  fileContext: FileContext[];
  /** All sources found */
  relevantSources: Source[];
}

/**
 * File context with relevance score
 */
export interface FileContext {
  /** File path */
  path: string;
  /** File content */
  content: string;
  /** Relevance score (0-1) */
  relevance: number;
}

/**
 * Enhanced Verification Rules (Story 2.3)
 *
 * Rules-based verification for response quality assurance.
 * Error severity rules block pass; warning severity rules provide feedback but don't block.
 */
export const VERIFICATION_RULES: VerificationRule[] = [
  {
    name: 'not_empty',
    check: (r) => r.trim().length > 0,
    feedback: 'Response cannot be empty',
    severity: 'error',
  },
  {
    name: 'minimum_length',
    check: (r, i) => r.length >= Math.min(i.length, 50),
    feedback: 'Response is too short for the question',
    severity: 'warning',
  },
  {
    name: 'no_markdown_bold',
    check: (r) => !/\*\*[^*]+\*\*/.test(r),
    feedback: 'Use Slack mrkdwn (*bold*) not markdown (**bold**)',
    severity: 'error',
  },
  {
    name: 'no_blockquotes',
    check: (r) => !/^>/m.test(r),
    feedback: 'Do not use blockquotes, use bullet points instead',
    severity: 'error',
  },
  {
    name: 'addresses_question',
    check: (r, i) => {
      const keywords = extractKeywords(i);
      const responseWords = r.toLowerCase();
      return keywords.length === 0 || keywords.some((k) => responseWords.includes(k));
    },
    feedback: 'Response does not appear to address the question',
    severity: 'warning',
  },
  {
    name: 'cites_sources',
    check: (r, _, ctx) => {
      if (ctx.relevantSources.length === 0) return true;
      return /source|reference|from|according/i.test(r);
    },
    feedback: 'Context was gathered but sources are not cited',
    severity: 'warning',
  },
  {
    name: 'response_coherence',
    check: (r) => {
      // Check for incomplete sentences, repeated phrases, or nonsensical patterns
      const sentences = r.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      if (sentences.length === 0) return true;

      // Check for very short "sentences" that might indicate incoherence
      const veryShortSentences = sentences.filter((s) => s.trim().length < 10);
      const shortRatio = veryShortSentences.length / sentences.length;
      if (shortRatio > 0.5) return false;

      // Check for obvious repeated phrases (3+ word repetition)
      const words = r.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 5; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        const rest = words.slice(i + 3).join(' ');
        if (rest.includes(phrase) && phrase.length > 10) return false;
      }

      return true;
    },
    feedback: 'Response appears incoherent or contains repeated phrases',
    severity: 'warning',
  },
  {
    name: 'factual_claim_check',
    check: (r, _, ctx) => {
      // Check if response makes strong factual claims without source support
      const strongClaimPatterns = [
        /definitely|certainly|always|never|100%|guaranteed/i,
        /studies show|research proves|data shows/i,
        /according to experts|scientists agree/i,
      ];

      const hasStrongClaims = strongClaimPatterns.some((p) => p.test(r));

      // If strong claims but no sources, flag as warning
      if (hasStrongClaims && ctx.relevantSources.length === 0) {
        return false;
      }

      return true;
    },
    feedback: 'Response makes strong factual claims without source support',
    severity: 'warning',
  },
];

/**
 * Run all verification rules against a response
 *
 * @param response - The response content to verify
 * @param input - The original user input
 * @param context - The gathered context
 * @returns VerificationResult with pass/fail and structured issues
 */
export function runVerificationRules(
  response: string,
  input: string,
  context: GatheredContext
): VerificationResult {
  const issues: VerificationIssue[] = [];

  for (const rule of VERIFICATION_RULES) {
    const passed = rule.check(response, input, context);
    if (!passed) {
      issues.push({
        rule: rule.name,
        severity: rule.severity,
        feedback: rule.feedback,
      });
    }
  }

  // Fail if any error-severity issues exist
  const hasErrors = issues.some((i) => i.severity === 'error');
  const passed = !hasErrors;

  const feedback =
    issues.length > 0
      ? `Please fix: ${issues.map((i) => i.feedback).join('; ')}`
      : 'Verification passed';

  return { passed, feedback, issues };
}

/**
 * Execute the canonical agent loop: Gather → Act → Verify
 *
 * MANDATORY: All agent implementations MUST follow this pattern (AR7)
 * Maximum 3 verification attempts before graceful failure (AR8)
 *
 * @param input - User message to process
 * @param context - Agent context with thread history and metadata
 * @param parentTrace - Langfuse parent trace for observability
 * @returns Agent response with verification status
 */
export async function executeAgentLoop(
  input: string,
  context: AgentContext,
  parentTrace: LangfuseTrace
): Promise<AgentResponse> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    context.attemptNumber = attempt + 1;

    logger.info({
      event: 'agent_loop_attempt',
      attempt: attempt + 1,
      maxAttempts: MAX_ATTEMPTS,
      traceId: context.traceId,
    });

    // PHASE 1: GATHER CONTEXT (AC#2)
    const gatherSpan = createSpan(parentTrace, {
      name: 'phase-gather',
      input: { userInput: input, attempt: attempt + 1 },
    });

    const gatheredContext = await gatherContext(input, context);

    gatherSpan.end({
      output: {
        threadContextCount: gatheredContext.threadContext.length,
        fileContextCount: gatheredContext.fileContext.length,
        sourcesFound: gatheredContext.relevantSources.length,
      },
    });

    // PHASE 2: TAKE ACTION (AC#3)
    const actSpan = createSpan(parentTrace, {
      name: 'phase-act',
      input: {
        userInput: input,
        contextSize:
          gatheredContext.threadContext.length +
          gatheredContext.fileContext.length,
        verificationFeedback: context.verificationFeedback,
      },
    });

    const response = await takeAction(input, gatheredContext, context);

    actSpan.end({
      output: {
        responseLength: response.content.length,
        sourcesUsed: response.sources.length,
      },
    });

    // PHASE 3: VERIFY WORK (AC#4) - Enhanced Langfuse logging (Story 2.3 Task 4)
    const verifySpan = createSpan(parentTrace, {
      name: 'phase-verify',
      input: {
        responseLength: response.content.length,
        responseSnippet: response.content.slice(0, 200),
        attempt: attempt + 1,
        previousIssueCount: context.previousIssueCount,
      },
    });

    const verification = await verifyResponse(response, input, gatheredContext);

    verifySpan.end({
      output: {
        passed: verification.passed,
        attempt: attempt + 1,
        issueCount: verification.issues.length,
        issues: verification.issues,
        feedback: verification.feedback,
      },
    });

    // Track verification metrics (AC#5)
    trackVerification(verification, attempt + 1);

    if (verification.passed) {
      logger.info({
        event: 'agent_loop_success',
        attempts: attempt + 1,
        traceId: context.traceId,
        previousIssueCount: context.previousIssueCount,
      });

      return {
        ...response,
        verified: true,
        attemptCount: attempt + 1,
      };
    }

    // Track improvement: log previous vs current issue count
    const currentIssueCount = verification.issues.length;
    const improvement =
      context.previousIssueCount !== undefined
        ? context.previousIssueCount - currentIssueCount
        : undefined;

    logger.warn({
      event: 'verification_failed',
      attempt: attempt + 1,
      issues: verification.issues,
      issueCount: currentIssueCount,
      previousIssueCount: context.previousIssueCount,
      improvement,
      traceId: context.traceId,
    });

    // Set feedback and issue count for next iteration
    context.verificationFeedback = verification.feedback;
    context.previousIssueCount = currentIssueCount;
  }

  // All attempts exhausted — graceful failure (AR8)
  logger.error({
    event: 'agent_loop_exhausted',
    attempts: MAX_ATTEMPTS,
    traceId: context.traceId,
  });

  return createGracefulFailureResponse(input, context);
}

/**
 * GATHER PHASE: Search available context (AC#2)
 *
 * Searches thread history and orion-context/ for relevant information.
 */
async function gatherContext(
  input: string,
  context: AgentContext
): Promise<GatheredContext> {
  const startTime = Date.now();
  const relevantSources: Source[] = [];

  // 1. Thread context (already available)
  const threadContext = context.threadHistory.filter((msg) =>
    isRelevantToQuery(msg, input)
  );

  if (threadContext.length > 0) {
    relevantSources.push({
      type: 'thread',
      reference: `Thread ${context.threadTs}`,
      excerpt: `${threadContext.length} relevant messages`,
    });
  }

  // 2. Search orion-context/ for relevant files
  const fileContext = await searchOrionContext(input);

  for (const file of fileContext) {
    relevantSources.push({
      type: 'file',
      reference: file.path,
      excerpt: file.content.slice(0, 100) + '...',
    });
  }

  logger.info({
    event: 'context_gathered',
    threadContextCount: threadContext.length,
    fileContextCount: fileContext.length,
    duration: Date.now() - startTime,
  });

  return {
    threadContext,
    fileContext,
    relevantSources,
  };
}

/**
 * Check if a message is relevant to the query
 */
function isRelevantToQuery(message: string, query: string): boolean {
  // Simple keyword matching for now
  // Can be enhanced with embeddings/semantic search later
  const queryWords = query.toLowerCase().split(/\s+/);
  const messageWords = message.toLowerCase();

  return queryWords.some((word) => word.length > 3 && messageWords.includes(word));
}

/**
 * Search orion-context/ directory for relevant files
 *
 * @returns Array of relevant file contexts
 */
async function searchOrionContext(_query: string): Promise<FileContext[]> {
  // TODO: Implement agentic search using Claude SDK
  // For now, return empty array
  // Full implementation in Story 2.8 (File-Based Memory)
  return [];
}

/**
 * ACT PHASE: Generate response based on gathered context (AC#3)
 */
async function takeAction(
  input: string,
  gatheredContext: GatheredContext,
  context: AgentContext
): Promise<Omit<AgentResponse, 'verified' | 'attemptCount'>> {
  // Build context string
  const contextString = buildContextString(gatheredContext);

  // Build prompt with context and any verification feedback
  let enhancedPrompt = input;

  if (contextString) {
    enhancedPrompt = `Context:\n${contextString}\n\nUser Question: ${input}`;
  }

  if (context.verificationFeedback) {
    enhancedPrompt += `\n\n[Previous attempt feedback: ${context.verificationFeedback}]`;
  }

  // Generate response content
  const content = await generateResponseContent(enhancedPrompt, gatheredContext);

  return {
    content,
    sources: gatheredContext.relevantSources,
  };
}

/**
 * Build context string from gathered context
 */
function buildContextString(context: GatheredContext): string {
  const parts: string[] = [];

  if (context.threadContext.length > 0) {
    parts.push('Thread History:');
    parts.push(...context.threadContext.slice(-5)); // Last 5 relevant messages
  }

  if (context.fileContext.length > 0) {
    parts.push('\nRelevant Files:');
    for (const file of context.fileContext.slice(0, 3)) {
      // Top 3 files
      parts.push(`[${file.path}]: ${file.content.slice(0, 500)}`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate response content
 *
 * Placeholder for Claude SDK integration.
 * Full implementation replaces this with Claude SDK query().
 */
async function generateResponseContent(
  _prompt: string,
  context: GatheredContext
): Promise<string> {
  // This will be replaced with Claude SDK query() in production
  // For now, return a structured placeholder
  const sourceCount = context.relevantSources.length;

  return (
    `Based on ${sourceCount} sources, here's my response to your question.\n\n` +
    `_This is a placeholder response. Full Claude SDK integration enables intelligent responses._\n\n` +
    `Sources consulted:\n` +
    context.relevantSources.map((s) => `• ${s.reference}`).join('\n')
  );
}

/**
 * VERIFY PHASE: Check response for accuracy and completeness (AC#4)
 *
 * Uses enhanced verification rules (Story 2.3) for comprehensive checks.
 * Error-severity issues block pass; warning-severity issues provide feedback.
 */
async function verifyResponse(
  response: Omit<AgentResponse, 'verified' | 'attemptCount'>,
  originalInput: string,
  context: GatheredContext
): Promise<VerificationResult> {
  return runVerificationRules(response.content, originalInput, context);
}

/**
 * Extract keywords from text for basic relevance checking
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .slice(0, 10);
}

/**
 * Create a graceful failure response when all verification attempts exhausted (AC#3)
 *
 * Uses Slack mrkdwn format (*bold* not **bold**), no blockquotes.
 * Includes helpful message explaining possible reasons and actionable suggestions.
 *
 * @param _input - Original user input (for future context-aware messaging)
 * @param _context - Agent context (for future context-aware messaging)
 * @returns Formatted AgentResponse with verified=false
 */
export function createGracefulFailureResponse(
  _input: string,
  _context: AgentContext
): AgentResponse {
  const reasons = [
    "The question requires information I don't have access to",
    'I need more context to provide an accurate answer',
    "The verification checks couldn't be satisfied",
  ];

  const suggestions = [
    'Try rephrasing your question',
    'Provide more specific details',
    'Break down complex questions into smaller parts',
  ];

  return {
    content:
      `I apologize, but I wasn't able to provide a verified response after ${MAX_ATTEMPTS} attempts.\n\n` +
      `*Possible reasons:*\n` +
      reasons.map((r) => `• ${r}`).join('\n') +
      `\n\n*Suggestions:*\n` +
      suggestions.map((s) => `• ${s}`).join('\n'),
    sources: [],
    verified: false,
    attemptCount: MAX_ATTEMPTS,
  };
}

