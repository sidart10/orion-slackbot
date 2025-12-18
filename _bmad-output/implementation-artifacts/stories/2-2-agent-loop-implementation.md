# Story 2.2: Agent Loop Implementation

Status: ready-for-dev

## Story

As a **user**,
I want Orion to gather context before answering,
So that responses are grounded in real information, not assumptions.

## Acceptance Criteria

1. **Given** the Claude SDK is integrated, **When** Orion processes a user message, **Then** the agent loop executes: Gather Context → Take Action → Verify Work

2. **Given** the agent loop is executing, **When** the gather phase runs, **Then** it searches available context (thread history, orion-context/)

3. **Given** context has been gathered, **When** the act phase runs, **Then** it generates a response based on gathered context

4. **Given** a response has been generated, **When** the verify phase runs, **Then** it checks the response for accuracy

5. **Given** the agent loop is executing, **When** each phase completes, **Then** each phase is logged as a span within the Langfuse trace

## Tasks / Subtasks

- [ ] **Task 1: Create Agent Loop Module** (AC: #1)
  - [ ] Create `src/agent/loop.ts`
  - [ ] Implement `executeAgentLoop()` function
  - [ ] Define `AgentContext` interface with all required fields
  - [ ] Define `AgentResponse` interface
  - [ ] Implement MAX_ATTEMPTS = 3 retry logic

- [ ] **Task 2: Implement Gather Phase** (AC: #2)
  - [ ] Create `gatherContext()` function
  - [ ] Search thread history for relevant context
  - [ ] Search `orion-context/` directory for relevant files
  - [ ] Aggregate gathered context into structured format
  - [ ] Log gathered sources

- [ ] **Task 3: Implement Act Phase** (AC: #3)
  - [ ] Create `takeAction()` function
  - [ ] Construct prompt with gathered context
  - [ ] Call Claude SDK with enriched prompt
  - [ ] Handle streaming responses
  - [ ] Return structured response

- [ ] **Task 4: Implement Verify Phase** (AC: #4)
  - [ ] Create `verifyResponse()` function
  - [ ] Implement rules-based verification (quick checks)
  - [ ] Check for response completeness
  - [ ] Check for formatting compliance
  - [ ] Return verification result with feedback

- [ ] **Task 5: Add Phase-Level Langfuse Spans** (AC: #5)
  - [ ] Create span for GATHER phase
  - [ ] Create span for ACT phase
  - [ ] Create span for VERIFY phase
  - [ ] Log phase inputs and outputs
  - [ ] Track phase durations

- [ ] **Task 6: Integrate Loop with Agent Module** (AC: #1)
  - [ ] Update `src/agent/orion.ts` to use `executeAgentLoop()`
  - [ ] Pass agent context through the loop
  - [ ] Handle loop errors gracefully

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Send message to Orion
  - [ ] Verify Langfuse trace shows GATHER, ACT, VERIFY spans
  - [ ] Verify gathered context appears in trace
  - [ ] Verify response is based on gathered context
  - [ ] Verify verification feedback is logged

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR7 | architecture.md | ALL agent implementations MUST follow the canonical agent loop pattern |
| AR8 | architecture.md | Maximum 3 verification attempts before graceful failure |
| FR1 | prd.md | System executes agent loop for every user interaction |

### Agent Loop Pattern (MANDATORY)

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT LOOP                                  │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   GATHER    │───▶│    ACT      │───▶│   VERIFY    │         │
│  │   Context   │    │   Response  │    │    Work     │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                               │                  │
│                                    ┌──────────▼──────────┐      │
│                                    │   Passed?           │      │
│                                    └──────────┬──────────┘      │
│                                        │             │          │
│                                       Yes           No          │
│                                        │             │          │
│                                        ▼             ▼          │
│                                    [Return]    [Retry < 3?]     │
│                                                  │       │      │
│                                                 Yes      No     │
│                                                  │       │      │
│                                                  ▲       ▼      │
│                                              [Loop]  [Graceful  │
│                                                       Failure]  │
└─────────────────────────────────────────────────────────────────┘
```

### src/agent/loop.ts

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSpan } from '../observability/tracing.js';
import { logger } from '../utils/logger.js';
import { OrionError, ErrorCode } from '../utils/errors.js';

const MAX_ATTEMPTS = 3;

export interface AgentContext {
  userId: string;
  channelId: string;
  threadTs: string;
  threadHistory: string[];
  traceId?: string;
  verificationFeedback?: string;
  attemptNumber?: number;
}

export interface AgentResponse {
  content: string;
  sources: Source[];
  verified: boolean;
  attemptCount: number;
}

export interface Source {
  type: 'thread' | 'file' | 'web' | 'tool';
  reference: string;
  excerpt?: string;
}

export interface VerificationResult {
  passed: boolean;
  feedback: string;
  issues: string[];
}

export interface GatheredContext {
  threadContext: string[];
  fileContext: FileContext[];
  relevantSources: Source[];
}

export interface FileContext {
  path: string;
  content: string;
  relevance: number;
}

/**
 * Execute the canonical agent loop: Gather → Act → Verify
 * 
 * MANDATORY: All agent implementations MUST follow this pattern (AR7)
 * Maximum 3 verification attempts before graceful failure (AR8)
 */
export async function executeAgentLoop(
  input: string,
  context: AgentContext,
  parentTrace: any
): Promise<AgentResponse> {
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    context.attemptNumber = attempt + 1;
    
    logger.info({
      event: 'agent_loop_attempt',
      attempt: attempt + 1,
      maxAttempts: MAX_ATTEMPTS,
      traceId: context.traceId,
    });

    // PHASE 1: GATHER CONTEXT
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

    // PHASE 2: TAKE ACTION
    const actSpan = createSpan(parentTrace, {
      name: 'phase-act',
      input: {
        userInput: input,
        contextSize: gatheredContext.threadContext.length + gatheredContext.fileContext.length,
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

    // PHASE 3: VERIFY WORK
    const verifySpan = createSpan(parentTrace, {
      name: 'phase-verify',
      input: {
        responseLength: response.content.length,
        attempt: attempt + 1,
      },
    });

    const verification = await verifyResponse(response, input, gatheredContext);

    verifySpan.end({
      output: {
        passed: verification.passed,
        issues: verification.issues,
      },
    });

    if (verification.passed) {
      logger.info({
        event: 'agent_loop_success',
        attempts: attempt + 1,
        traceId: context.traceId,
      });

      return {
        ...response,
        verified: true,
        attemptCount: attempt + 1,
      };
    }

    // Set feedback for next iteration
    context.verificationFeedback = verification.feedback;

    logger.warn({
      event: 'verification_failed',
      attempt: attempt + 1,
      issues: verification.issues,
      traceId: context.traceId,
    });
  }

  // All attempts exhausted — graceful failure
  logger.error({
    event: 'agent_loop_exhausted',
    attempts: MAX_ATTEMPTS,
    traceId: context.traceId,
  });

  return createGracefulFailureResponse(input, context);
}

/**
 * GATHER PHASE: Search available context
 */
async function gatherContext(
  input: string,
  context: AgentContext
): Promise<GatheredContext> {
  const startTime = Date.now();
  const relevantSources: Source[] = [];

  // 1. Thread context (already available)
  const threadContext = context.threadHistory.filter(msg => 
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
  
  return queryWords.some(word => 
    word.length > 3 && messageWords.includes(word)
  );
}

/**
 * Search orion-context/ directory for relevant files
 */
async function searchOrionContext(query: string): Promise<FileContext[]> {
  // TODO: Implement agentic search using Claude SDK
  // For now, return empty array
  // Full implementation in Story 2.8 (File-Based Memory)
  return [];
}

/**
 * ACT PHASE: Generate response based on gathered context
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

  // Collect response (streaming handled by caller)
  let content = '';
  
  // For now, use a simple response pattern
  // Full Claude SDK streaming integration is in Story 2.1
  content = await generateResponseContent(enhancedPrompt, gatheredContext);

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
    for (const file of context.fileContext.slice(0, 3)) { // Top 3 files
      parts.push(`[${file.path}]: ${file.content.slice(0, 500)}`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate response content
 * Placeholder for Claude SDK integration
 */
async function generateResponseContent(
  prompt: string,
  context: GatheredContext
): Promise<string> {
  // This will be replaced with Claude SDK query() in production
  // For now, return a structured placeholder
  const sourceCount = context.relevantSources.length;
  
  return `Based on ${sourceCount} sources, here's my response to your question.\n\n` +
    `_This is a placeholder response. Full Claude SDK integration enables intelligent responses._\n\n` +
    `Sources consulted:\n` +
    context.relevantSources.map(s => `• ${s.reference}`).join('\n');
}

/**
 * VERIFY PHASE: Check response for accuracy and completeness
 */
async function verifyResponse(
  response: Omit<AgentResponse, 'verified' | 'attemptCount'>,
  originalInput: string,
  context: GatheredContext
): Promise<VerificationResult> {
  const issues: string[] = [];

  // Rule 1: Response must not be empty
  if (!response.content || response.content.trim().length === 0) {
    issues.push('Response is empty');
  }

  // Rule 2: Response must be reasonably long for the query
  const minLength = originalInput.length > 50 ? 100 : 50;
  if (response.content.length < minLength) {
    issues.push(`Response too short (${response.content.length} chars, minimum ${minLength})`);
  }

  // Rule 3: No markdown bold (should be mrkdwn)
  if (/\*\*[^*]+\*\*/.test(response.content)) {
    issues.push('Uses markdown bold (**) instead of Slack mrkdwn (*)');
  }

  // Rule 4: No blockquotes
  if (/^>/m.test(response.content)) {
    issues.push('Contains blockquotes (not allowed per AR22)');
  }

  // Rule 5: Should cite sources if context was gathered
  if (context.relevantSources.length > 0 && !response.content.includes('source')) {
    issues.push('Context was gathered but sources not cited');
  }

  // Rule 6: Response should address the question
  const questionKeywords = extractKeywords(originalInput);
  const responseKeywords = extractKeywords(response.content);
  const overlap = questionKeywords.filter(k => responseKeywords.includes(k));
  
  if (overlap.length === 0 && questionKeywords.length > 0) {
    issues.push('Response may not address the question (no keyword overlap)');
  }

  const passed = issues.length === 0;
  const feedback = issues.length > 0
    ? `Please fix: ${issues.join('; ')}`
    : 'Verification passed';

  return { passed, feedback, issues };
}

/**
 * Extract keywords from text for basic relevance checking
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 10);
}

/**
 * Create a graceful failure response when all attempts exhausted
 */
function createGracefulFailureResponse(
  input: string,
  context: AgentContext
): AgentResponse {
  return {
    content: `I apologize, but I wasn't able to provide a verified response to your question after ${MAX_ATTEMPTS} attempts. ` +
      `This might be because:\n\n` +
      `• The question requires information I don't have access to\n` +
      `• I need more context to provide an accurate answer\n\n` +
      `Could you try rephrasing your question or providing more details?`,
    sources: [],
    verified: false,
    attemptCount: MAX_ATTEMPTS,
  };
}
```

### Updated src/agent/orion.ts

```typescript
import { executeAgentLoop, AgentContext } from './loop.js';
import { loadAgentPrompt } from './loader.js';
import { logger } from '../utils/logger.js';

export interface AgentOptions {
  context: {
    threadHistory: string[];
    userId: string;
    channelId: string;
    threadTs: string;
    traceId?: string;
  };
  parentTrace: any;
}

/**
 * Run the Orion agent with the canonical agent loop
 */
export async function* runOrionAgent(
  userMessage: string,
  options: AgentOptions
): AsyncGenerator<string, void> {
  const startTime = Date.now();

  logger.info({
    event: 'orion_agent_start',
    userId: options.context.userId,
    traceId: options.context.traceId,
  });

  // Execute the agent loop
  const response = await executeAgentLoop(
    userMessage,
    options.context,
    options.parentTrace
  );

  // Stream the response content
  // For now, yield the entire response
  // Chunked streaming will be enhanced when Claude SDK is fully integrated
  yield response.content;

  // Add source citations if available
  if (response.sources.length > 0) {
    yield '\n\n_Sources:_\n';
    for (const source of response.sources) {
      yield `• ${source.reference}\n`;
    }
  }

  const duration = Date.now() - startTime;
  logger.info({
    event: 'orion_agent_complete',
    userId: options.context.userId,
    duration,
    verified: response.verified,
    attemptCount: response.attemptCount,
    traceId: options.context.traceId,
  });
}
```

### File Structure After This Story

```
orion-slack-agent/
├── src/
│   ├── agent/
│   │   ├── orion.ts                # Updated to use executeAgentLoop
│   │   ├── loop.ts                 # Agent loop implementation (NEW)
│   │   ├── loader.ts               # Agent loader (from Story 2.1)
│   │   └── tools.ts                # Tool config (from Story 2.1)
│   └── ...
└── ...
```

### Langfuse Trace Structure

```
user-message-handler (trace)
├── orion-agent-execution (span)
│   ├── phase-gather (span)
│   │   └── input: { userInput, attempt }
│   │   └── output: { threadContextCount, fileContextCount, sourcesFound }
│   ├── phase-act (span)
│   │   └── input: { userInput, contextSize, verificationFeedback }
│   │   └── output: { responseLength, sourcesUsed }
│   └── phase-verify (span)
│       └── input: { responseLength, attempt }
│       └── output: { passed, issues }
└── response-streaming (span)
```

### References

- [Source: _bmad-output/epics.md#Story 2.2: Agent Loop Implementation] — Original story definition
- [Source: _bmad-output/architecture.md#Communication Patterns] — Agent loop pattern
- [Source: _bmad-output/architecture.md#Agent Execution] — Verification strategy

### Previous Story Intelligence

From Story 2-1 (Claude Agent SDK):
- `runOrionAgent()` exists but needs to integrate with loop
- `loadAgentPrompt()` available for system prompts
- Agent context structure defined

From Story 1-2 (Langfuse):
- `createSpan()` for nested spans
- Traces wrap all handlers

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- The `searchOrionContext()` function is a placeholder — full implementation in Story 2.8
- Verification rules are basic — can be enhanced with LLM-as-Judge in future
- Response generation is a placeholder — fully replaced by Claude SDK when integrated
- The loop yields the complete response — chunked streaming is a future enhancement

### File List

Files to create:
- `src/agent/loop.ts`

Files to modify:
- `src/agent/orion.ts` (integrate with loop)

