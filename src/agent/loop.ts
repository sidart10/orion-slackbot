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

import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSpan } from '../observability/tracing.js';
import { logger } from '../utils/logger.js';
import { trackVerification, trackCitations } from '../observability/metrics.js';
import type { LangfuseTrace } from '../observability/langfuse.js';
import {
  detectUncitedClaims,
  buildCitationRegistry,
  detectFactualClaims,
} from './citations.js';
import {
  shouldTriggerCompaction,
  compactWithLogging,
  estimateTokenCount,
  type ConversationMessage,
} from './compaction.js';
import { config } from '../config/environment.js';
import { searchMemoryWithScores, type MemorySearchResult } from '../memory/index.js';
import { loadUserPreference, type UserPreference } from '../memory/preferences.js';
import { searchKnowledge, type Knowledge } from '../memory/knowledge.js';
import { getToolConfig } from './tools.js';
import { markServerUnavailable } from '../tools/mcp/health.js';
import { getToolContextSummary } from '../tools/context.js';
import {
  needsDiscovery,
  logDiscoveryStats,
  extractToolFromSdkMessage,
  registerDiscoveredTools,
} from '../tools/mcp/discovery.js';
import type { ToolSchema } from '../tools/registry.js';

// Initialize Anthropic client (kept for other uses if any, but query uses its own)
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

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
  /** Knowledge items from orion-context/knowledge/ (Story 2.9) */
  knowledgeContext: KnowledgeContext[];
  /** All sources found */
  relevantSources: Source[];
  /** User preferences loaded from memory (AC#3, Task 4.3) */
  userPreference?: UserPreference;
}

/**
 * Knowledge context with relevance info (Story 2.9)
 */
export interface KnowledgeContext {
  /** Knowledge item name */
  name: string;
  /** Knowledge content */
  content: string;
  /** Category for organization */
  category: string;
  /** Tags for searchability */
  tags: string[];
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
      // If no sources were gathered, no citations needed
      if (ctx.relevantSources.length === 0) return true;

      // Use detectUncitedClaims for proper citation detection (AC#4)
      const citations = buildCitationRegistry(ctx.relevantSources).citations;
      const { hasUncitedClaims } = detectUncitedClaims(r, citations);

      // Also check if response has factual claims that need citations
      const hasFactualClaims = detectFactualClaims(r);

      // Fail if: sources gathered + no citations + factual claims present
      if (hasUncitedClaims && hasFactualClaims) {
        return false;
      }

      // Pass if citations are present or no factual claims
      return !hasUncitedClaims;
    },
    feedback: 'Sources were gathered but response lacks citation markers [1], [2], etc.',
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
  // Check if context compaction is needed (Story 2.6 AC#1)
  // Convert thread history to ConversationMessage format for token estimation
  const contextMessages: ConversationMessage[] = context.threadHistory.map(
    (msg, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: msg,
    })
  );

  const currentTokenCount = contextMessages.reduce(
    (sum, msg) => sum + estimateTokenCount(msg.content),
    0
  );

  // Trigger compaction if approaching 200k limit (80% threshold)
  if (shouldTriggerCompaction(currentTokenCount)) {
    logger.info({
      event: 'context_compaction_triggered',
      tokenCount: currentTokenCount,
      threshold: 160_000,
      traceId: context.traceId,
    });

    try {
      const compactionResult = await compactWithLogging(
        contextMessages,
        parentTrace,
        { minRecentMessages: 10 }
      );

      // Update context with compacted messages
      context.threadHistory = compactionResult.compactedMessages.map(
        (msg) => msg.content
      );

      logger.info({
        event: 'context_compaction_complete',
        originalTokens: compactionResult.originalTokens,
        compactedTokens: compactionResult.compactedTokens,
        tokensSaved: compactionResult.originalTokens - compactionResult.compactedTokens,
        traceId: context.traceId,
      });
    } catch (error) {
      // Log error but continue without compaction - graceful degradation
      logger.error({
        event: 'context_compaction_failed',
        error: error instanceof Error ? error.message : String(error),
        traceId: context.traceId,
      });
    }
  }

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
        knowledgeContextCount: gatheredContext.knowledgeContext.length,
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
          gatheredContext.knowledgeContext.length +
          gatheredContext.fileContext.length,
        verificationFeedback: context.verificationFeedback,
      },
    });

    // Pass parentTrace for MCP tool tracing (Story 3.1 Task 6)
    const response = await takeAction(input, gatheredContext, context, parentTrace);

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

    // Track citation metrics (Story 2.7 AC#3)
    const citationResult = detectUncitedClaims(
      response.content,
      buildCitationRegistry(gatheredContext.relevantSources).citations
    );
    trackCitations(
      gatheredContext.relevantSources.length,
      citationResult.citationCount,
      context.traceId
    );

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
 * Searches thread history, orion-context/knowledge/, orion-context/, and user preferences.
 * Knowledge sources are prioritized over other file sources (Story 2.9 AC#1).
 *
 * @see Story 2.8 Task 4.3 - Load preferences at gather phase
 * @see Story 2.9 AC#1 - Search relevant knowledge sources before answering
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

  // 2. Search orion-context/knowledge/ for authoritative knowledge (Story 2.9 AC#1)
  // Knowledge sources are prioritized - added first to relevantSources
  let knowledgeContext: KnowledgeContext[] = [];
  try {
    const knowledgeItems = await searchKnowledge(input);
    knowledgeContext = knowledgeItems.map((k) => ({
      name: k.name,
      content: k.content,
      category: k.category,
      tags: k.tags,
    }));

    // Add knowledge sources with high priority (added first)
    for (const knowledge of knowledgeContext) {
      relevantSources.unshift({
        type: 'file',
        reference: `knowledge/${knowledge.name}`,
        excerpt: knowledge.content.slice(0, 100) + '...',
      });
    }
  } catch (error) {
    logger.error({
      event: 'knowledge_search_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 3. Search orion-context/ for other relevant files
  const fileContext = await searchOrionContext(input);

  for (const file of fileContext) {
    relevantSources.push({
      type: 'file',
      reference: file.path,
      excerpt: file.content.slice(0, 100) + '...',
    });
  }

  // 4. Load user preferences (Story 2.8 AC#3, Task 4.3)
  let userPreference: UserPreference | undefined;
  try {
    userPreference = (await loadUserPreference(context.userId)) ?? undefined;
    if (userPreference) {
      relevantSources.push({
        type: 'file',
        reference: `user-preferences/${context.userId}`,
        excerpt: `User preferences: ${Object.keys(userPreference.preferences).length} settings`,
      });
    }
  } catch (error) {
    logger.error({
      event: 'preference_load_failed',
      userId: context.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info({
    event: 'context_gathered',
    threadContextCount: threadContext.length,
    knowledgeContextCount: knowledgeContext.length,
    fileContextCount: fileContext.length,
    hasUserPreference: !!userPreference,
    duration: Date.now() - startTime,
  });

  return {
    threadContext,
    knowledgeContext,
    fileContext,
    relevantSources,
    userPreference,
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
 * Search orion-context/ directory for relevant files (AC#2)
 *
 * Uses the memory module's keyword search to find relevant memories.
 * Converts MemorySearchResult objects to FileContext for compatibility with gather phase.
 * Passes through actual relevance scores from keyword matching.
 *
 * @param query - Search query string
 * @returns Array of relevant file contexts with actual relevance scores
 * @see Story 2.8 - File-Based Memory (Task 4 review follow-up)
 */
async function searchOrionContext(query: string): Promise<FileContext[]> {
  try {
    const results: MemorySearchResult[] = await searchMemoryWithScores(query);

    return results.map((result) => ({
      path: result.memory.key,
      content: result.memory.content,
      relevance: result.relevance, // Actual normalized relevance score (0-1)
    }));
  } catch (error) {
    logger.error({
      event: 'orion_context_search_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * ACT PHASE: Generate response based on gathered context (AC#3)
 *
 * @param input - User input
 * @param gatheredContext - Context gathered in gather phase
 * @param context - Agent context
 * @param parentTrace - Langfuse parent trace for MCP tool tracing (Story 3.1 Task 6)
 */
async function takeAction(
  input: string,
  gatheredContext: GatheredContext,
  context: AgentContext,
  parentTrace?: LangfuseTrace
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

  // Generate response content with MCP tracing
  const content = await generateResponseContent(enhancedPrompt, gatheredContext, parentTrace);

  return {
    content,
    sources: gatheredContext.relevantSources,
  };
}

/**
 * Build context string from gathered context
 *
 * Includes knowledge sources first (highest priority), then thread history,
 * then other files. Uses last 5 relevant messages for thread context.
 * Includes user preferences for personalization (Story 2.8 AC#3).
 *
 * @see Story 2.9 AC#2 - Answer is grounded in found information
 */
function buildContextString(context: GatheredContext): string {
  const parts: string[] = [];

  // Include user preferences first (for personalization)
  if (context.userPreference && Object.keys(context.userPreference.preferences).length > 0) {
    parts.push('## User Preferences');
    parts.push('');
    for (const [key, value] of Object.entries(context.userPreference.preferences)) {
      parts.push(`- ${key}: ${value}`);
    }
    parts.push('');
    parts.push('_Respect the user\'s preferences when formulating your response._');
    parts.push('');
  }

  // Include knowledge sources with highest priority (Story 2.9 AC#2)
  if (context.knowledgeContext.length > 0) {
    parts.push('## Knowledge Base');
    parts.push('');
    parts.push('_The following information comes from authoritative knowledge sources. Base your answer on this information and cite sources using [1], [2], etc._');
    parts.push('');
    context.knowledgeContext.slice(0, 5).forEach((knowledge, index) => {
      parts.push(`### [${index + 1}] ${knowledge.name}`);
      parts.push(knowledge.content);
      parts.push('');
    });
  }

  if (context.threadContext.length > 0) {
    parts.push('## Previous Conversation');
    parts.push('');
    parts.push(...context.threadContext.slice(-5)); // Last 5 relevant messages
    parts.push('');
    parts.push(
      '_When responding, you may reference previous messages in this thread. ' +
        'Use phrases like "As I mentioned earlier..." or "Building on what you said about..."_'
    );
  }

  if (context.fileContext.length > 0) {
    parts.push('');
    parts.push('## Relevant Files');
    for (const file of context.fileContext.slice(0, 3)) {
      // Top 3 files
      parts.push(`[${file.path}]: ${file.content.slice(0, 500)}`);
    }
  }

  return parts.join('\n');
}

/**
 * MCP Tool execution tracking for proper Langfuse tracing
 * Story 3.1 Task 6: Add MCP Execution Tracing (AC: #5)
 */
interface McpToolExecution {
  toolName: string;
  mcpServer?: string;
  startTime: number;
  arguments?: Record<string, unknown>;
}

/**
 * Sanitize arguments for logging - remove sensitive data
 * @param args - Raw arguments object
 * @returns Sanitized arguments safe for logging
 */
function sanitizeArguments(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential', 'api_key'];

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Generate response content using Claude Agent SDK
 *
 * Calls Claude with the user prompt and gathered context.
 * Uses Slack-optimized formatting guidelines.
 * Integrates MCP tools via getToolConfig().
 * Traces MCP tool executions via Langfuse (Story 3.1 Task 6).
 * Includes honesty instructions when no knowledge sources found (Story 2.9 AC#4).
 *
 * @param prompt - The enhanced prompt with context
 * @param context - Gathered context for determining if sources were found
 * @param parentTrace - Langfuse parent trace for MCP tool tracing
 */
async function generateResponseContent(
  prompt: string,
  context: GatheredContext,
  parentTrace?: LangfuseTrace
): Promise<string> {
  const toolConfig = getToolConfig();

  // Check if any knowledge sources were found (Story 2.9 AC#4)
  const hasKnowledgeSources = context.knowledgeContext.length > 0 ||
    context.fileContext.length > 0 ||
    context.threadContext.length > 0;

  // Build system prompt with context-aware honesty instructions
  let systemPrompt = `You are Orion, a helpful AI assistant in Slack.

Key formatting rules for Slack:
- Use *bold* for emphasis (not **bold**)
- Use _italic_ for secondary emphasis
- Use bullet points (•) for lists, not blockquotes (>)
- Keep responses concise and actionable
- Be friendly but professional`;

  if (hasKnowledgeSources) {
    systemPrompt += `

When answering questions:
- Base your answer on the provided knowledge sources
- Cite sources using [1], [2], etc. markers
- If the sources don't fully answer the question, say so`;
  } else {
    // No knowledge sources found - be honest (Story 2.9 AC#4)
    systemPrompt += `

*Important:* No specific knowledge sources were found for this query.
- Be honest if you don't have specific information
- Don't make up facts or speculate
- If you can't answer definitively, acknowledge this
- Suggest alternative ways to find the information:
  • Ask the user to provide more context
  • Suggest they check specific documentation
  • Offer to help search in a different way`;
  }

  systemPrompt += `

Respond naturally and helpfully to the user's message.`;

  // Add tool context summary (Story 3.2 AC#3: minimal tools in context per AR17)
  const toolContext = getToolContextSummary();
  if (toolContext) {
    systemPrompt += `

## Available Tools
${toolContext}`;
  }

  // Log discovery status for debugging (Story 3.2 AC#6)
  if (needsDiscovery()) {
    logger.debug({
      event: 'tool_discovery_pending',
      message: 'Tool discovery will occur during query execution',
    });
  } else {
    logDiscoveryStats();
  }

  try {
    const responseStream = query({
      prompt,
      options: {
        systemPrompt,
        mcpServers: toolConfig.mcpServers,
        allowedTools: toolConfig.allowedTools,
        settingSources: ['user', 'project'],
      },
    });

    let fullText = '';
    
    // Track active MCP tool executions for duration calculation
    const activeToolExecutions = new Map<string, McpToolExecution>();
    
    // Story 3.2: Collect discovered tools for registry population
    const discoveredTools: ToolSchema[] = [];
    
    // Iterate stream to capture text and trace MCP tools
    // SDK message types: 'user' | 'assistant' | 'result' | 'system' | 'stream_event' | 'tool_progress' | 'auth_status'
    // Tool events may come through stream_event or have extended types at runtime
    for await (const message of responseStream) {
      // Cast to access runtime type - SDK types may not include all runtime event types
      const msgType = (message as { type: string }).type;
      
      // Debug log all message types to understand SDK output
      logger.debug({
        event: 'sdk_message_received',
        msgType,
        hasContent: 'content' in message,
        keys: Object.keys(message),
      });
      
      // Capture assistant response text
      if (msgType === 'assistant') {
        const content = (message as { content?: string }).content;
        if (typeof content === 'string') {
          fullText += content;
        }
      }
      
      // Also capture result type which may contain final text
      if (msgType === 'result') {
        const content = (message as { content?: string }).content;
        if (typeof content === 'string') {
          fullText += content;
        }
      }
      
      // Capture stream_event which contains streaming text chunks
      if (msgType === 'stream_event') {
        const streamMsg = message as { 
          event?: string;
          data?: { text?: string; delta?: string; content?: string };
          text?: string;
        };
        // Try multiple possible locations for streaming text
        const text = streamMsg.text || 
                     streamMsg.data?.text || 
                     streamMsg.data?.delta ||
                     streamMsg.data?.content;
        if (typeof text === 'string') {
          fullText += text;
        }
      }
      
      // Story 3.1 Task 6: MCP Execution Tracing with Langfuse
      // Trace tool_use (start) and tool_result (end) for duration tracking
      // These types exist at runtime but may not be in SDK type definitions
      if (msgType === 'tool_use') {
        const toolMsg = message as {
          id?: string;
          name?: string;
          input?: unknown;
        };
        
        const toolId = toolMsg.id || `tool-${Date.now()}`;
        const toolName = toolMsg.name || 'unknown_tool';
        
        // Determine MCP server from tool name prefix (e.g., "rube_search" -> "rube")
        const mcpServer = toolName.includes('_') 
          ? toolName.split('_')[0] 
          : Object.keys(toolConfig.mcpServers)[0] || 'unknown';
        
        // Track execution start
        activeToolExecutions.set(toolId, {
          toolName,
          mcpServer,
          startTime: Date.now(),
          arguments: sanitizeArguments(toolMsg.input),
        });
        
        // Create Langfuse span for tool execution
        if (parentTrace) {
          const toolSpan = createSpan(parentTrace, {
            name: `mcp-tool-${toolName}`,
            input: {
              toolName,
              arguments: sanitizeArguments(toolMsg.input),
            },
            metadata: {
              mcpServer,
              toolId,
            },
          });
          
          // Store span reference for later completion
          (activeToolExecutions.get(toolId) as McpToolExecution & { span?: ReturnType<typeof createSpan> }).span = toolSpan;
        }
        
        logger.info({
          event: 'mcp_tool_start',
          toolName,
          toolId,
          mcpServer,
          arguments: sanitizeArguments(toolMsg.input),
          timestamp: new Date().toISOString(),
        });
        
        // Story 3.2: Extract tool schema for registry (AC#1, AC#2)
        const toolSchema = extractToolFromSdkMessage(
          {
            type: 'tool_use',
            tool: {
              name: toolName,
              description: '', // SDK doesn't provide description in tool_use
              input_schema: toolMsg.input,
            },
          },
          mcpServer
        );
        if (toolSchema) {
          discoveredTools.push(toolSchema);
        }
      }
      
      if (msgType === 'tool_result') {
        const resultMsg = message as {
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        };
        
        const toolId = resultMsg.tool_use_id || '';
        const execution = activeToolExecutions.get(toolId) as (McpToolExecution & { span?: ReturnType<typeof createSpan> }) | undefined;
        
        if (execution) {
          const duration = Date.now() - execution.startTime;
          const success = !resultMsg.is_error;
          
          // End Langfuse span with result
          if (execution.span) {
            execution.span.end({
              output: {
                success,
                duration,
                resultPreview: typeof resultMsg.content === 'string' 
                  ? resultMsg.content.slice(0, 500) 
                  : JSON.stringify(resultMsg.content).slice(0, 500),
              },
            });
          }
          
          logger.info({
            event: 'mcp_tool_complete',
            toolName: execution.toolName,
            toolId,
            mcpServer: execution.mcpServer,
            duration,
            success,
            timestamp: new Date().toISOString(),
          });
          
          // Story 3.1 AC#3: Mark MCP server unavailable on tool error (graceful degradation)
          if (!success && execution.mcpServer) {
            const errorMessage = typeof resultMsg.content === 'string' 
              ? resultMsg.content 
              : 'Tool execution failed';
            markServerUnavailable(execution.mcpServer, new Error(errorMessage));
          }
          
          activeToolExecutions.delete(toolId);
        }
      }
      
      // Also handle tool_progress for intermediate updates
      if (msgType === 'tool_progress') {
        const progressMsg = message as {
          tool_use_id?: string;
          progress?: unknown;
        };
        
        logger.debug({
          event: 'mcp_tool_progress',
          toolId: progressMsg.tool_use_id,
          progress: progressMsg.progress,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Story 3.2 AC#2, AC#4: Register discovered tools in cache
    if (discoveredTools.length > 0) {
      // Fire-and-forget registration (don't block response)
      registerDiscoveredTools(discoveredTools).catch((err) => {
        logger.warn({
          event: 'tool_registration_failed',
          error: err instanceof Error ? err.message : String(err),
          toolCount: discoveredTools.length,
        });
      });
    }

    if (fullText) {
      return fullText;
    }

    return 'I received your message but had trouble generating a response.';
  } catch (error) {
    logger.error({
      event: 'claude_api_error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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

