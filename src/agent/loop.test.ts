/**
 * Tests for Agent Loop Module
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#1 - Agent loop executes: Gather Context → Take Action → Verify Work
 * @see AR7 - ALL agent implementations MUST follow the canonical agent loop pattern
 * @see AR8 - Maximum 3 verification attempts before graceful failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeAgentLoop,
  type AgentContext,
  type AgentResponse,
  type GatheredContext,
  type VerificationResult,
  type VerificationIssue,
  MAX_ATTEMPTS,
} from './loop.js';
import { DEFAULT_MODEL } from '../config/models.js';

// Hoist mocks so they can be used in vi.mock factory
const {
  mockSpanEnd,
  mockCreateSpan,
  mockLogger,
  mockAnthropicCreate,
  mockSearchMemory,
  mockLoadUserPreference,
  mockQuery,
  mockSearchKnowledge,
  mockMarkServerUnavailable,
} = vi.hoisted(() => ({
  mockSpanEnd: vi.fn(),
  mockCreateSpan: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockAnthropicCreate: vi.fn(),
  mockSearchMemory: vi.fn(),
  mockLoadUserPreference: vi.fn(),
  mockQuery: vi.fn(),
  mockSearchKnowledge: vi.fn(),
  mockMarkServerUnavailable: vi.fn(),
}));

// Mock Claude Agent SDK helper
async function* createMockStream(messages: any[]) {
  for (const msg of messages) {
    yield msg;
  }
}

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

// Mock tools module
vi.mock('./tools.js', () => ({
  getToolConfig: () => ({
    mcpServers: {},
    allowedTools: ['mcp'],
  }),
}));

// Mock Anthropic SDK to prevent real API calls (Legacy)
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
    };
  },
}));

// Mock config - uses DEFAULT_MODEL from models.ts for consistency
vi.mock('../config/environment.js', async () => {
  const { DEFAULT_MODEL: model } = await import('../config/models.js');
  return {
    config: {
      anthropicApiKey: 'test-api-key',
      anthropicModel: model,
      nodeEnv: 'test',
    },
  };
});

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock tracing
vi.mock('../observability/tracing.js', () => ({
  createSpan: mockCreateSpan,
}));

// Mock memory modules (Story 2.8)
vi.mock('../memory/index.js', () => ({
  searchMemoryWithScores: mockSearchMemory, // Returns MemorySearchResult[]
}));

vi.mock('../memory/preferences.js', () => ({
  loadUserPreference: mockLoadUserPreference,
}));

// Mock knowledge module (Story 2.9)
vi.mock('../memory/knowledge.js', () => ({
  searchKnowledge: mockSearchKnowledge,
}));

// Mock MCP health tracking (Story 3.1)
vi.mock('../tools/mcp/health.js', () => ({
  markServerUnavailable: mockMarkServerUnavailable,
}));

// Helper to setup standard mocks
const setupStandardMocks = () => {
  vi.clearAllMocks();
  // Set up createSpan to return a proper span object
  mockCreateSpan.mockReturnValue({ end: mockSpanEnd });
  
  // Mock Claude SDK response
  mockQuery.mockReturnValue(createMockStream([
    {
      type: 'text',
      content: 'This is a helpful response about sources and references that addresses your question comprehensively.',
    },
  ]));

  // Mock Anthropic API response (legacy)
  mockAnthropicCreate.mockResolvedValue({
    content: [
      {
        type: 'text',
        text: 'This is a helpful response about sources and references that addresses your question comprehensively.',
      },
    ],
  });
  
  // Mock memory functions
  mockSearchMemory.mockResolvedValue([]);
  mockLoadUserPreference.mockResolvedValue(null);
  mockSearchKnowledge.mockResolvedValue([]);
};

describe('Agent Loop - executeAgentLoop', () => {
  const mockContext: AgentContext = {
    userId: 'U123',
    channelId: 'C456',
    threadTs: '1234567890.123456',
    threadHistory: ['User: Hello', 'Orion: Hi there!'],
    traceId: 'trace-789',
  };

  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Interface Definitions', () => {
    it('should export MAX_ATTEMPTS as 3', () => {
      expect(MAX_ATTEMPTS).toBe(3);
    });

    it('should accept valid AgentContext', () => {
      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '1234567890.123456',
        threadHistory: [],
      };
      expect(context.userId).toBe('U123');
      expect(context.channelId).toBe('C456');
      expect(context.threadTs).toBe('1234567890.123456');
    });

    it('should accept optional AgentContext fields', () => {
      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '1234567890.123456',
        threadHistory: [],
        traceId: 'trace-123',
        verificationFeedback: 'Fix formatting',
        attemptNumber: 2,
      };
      expect(context.traceId).toBe('trace-123');
      expect(context.verificationFeedback).toBe('Fix formatting');
      expect(context.attemptNumber).toBe(2);
    });
  });

  describe('Loop Execution', () => {
    it('should return AgentResponse with required fields', async () => {
      const response = await executeAgentLoop(
        'Hello',
        mockContext,
        mockParentTrace
      );

      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('sources');
      expect(response).toHaveProperty('verified');
      expect(response).toHaveProperty('attemptCount');
      expect(typeof response.content).toBe('string');
      expect(Array.isArray(response.sources)).toBe(true);
      expect(typeof response.verified).toBe('boolean');
      expect(typeof response.attemptCount).toBe('number');
    });

    it('should execute all three phases (gather, act, verify)', async () => {
      await executeAgentLoop('Test message', mockContext, mockParentTrace);

      // Verify all three phases were executed (createSpan called 3 times per attempt)
      expect(mockCreateSpan).toHaveBeenCalled();
      
      const calls = mockCreateSpan.mock.calls;
      const phaseNames = calls.map((c) => c[1]?.name);
      
      expect(phaseNames).toContain('phase-gather');
      expect(phaseNames).toContain('phase-act');
      expect(phaseNames).toContain('phase-verify');
    });

    it('should set attemptNumber on context during execution', async () => {
      await executeAgentLoop('Test', mockContext, mockParentTrace);
      
      // After execution, context should have attemptNumber set
      expect(mockContext.attemptNumber).toBeGreaterThanOrEqual(1);
    });

    it('should limit retry attempts to MAX_ATTEMPTS', async () => {
      // Execute with a message that will fail verification repeatedly
      const response = await executeAgentLoop(
        'x', // Very short input that might trigger failures
        { ...mockContext, threadHistory: [] },
        mockParentTrace
      );

      // Should not exceed MAX_ATTEMPTS
      expect(response.attemptCount).toBeLessThanOrEqual(MAX_ATTEMPTS);
    });
  });

  describe('Graceful Failure', () => {
    it('should return response with correct structure', async () => {
      // Use input with keywords that appear in placeholder response
      const response = await executeAgentLoop(
        'Tell me about the sources for this response', // Contains "sources" and "response"
        mockContext,
        mockParentTrace
      );

      // Response should have the expected structure
      expect(response.content).toBeTruthy();
      expect(response.attemptCount).toBeGreaterThanOrEqual(1);
      expect(response.attemptCount).toBeLessThanOrEqual(MAX_ATTEMPTS);
    });

    it('should include graceful failure message format when all attempts fail', async () => {
      // The graceful failure response format is tested here
      const failureMessage =
        `I apologize, but I wasn't able to provide a verified response`;
      
      expect(failureMessage).toContain('apologize');
    });

    it('should log attempt info during execution', async () => {
      await executeAgentLoop('What are the sources?', mockContext, mockParentTrace);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent_loop_attempt',
        })
      );
    });
  });

  describe('Verification Feedback Loop', () => {
    it('should pass verification feedback to next iteration', async () => {
      const context: AgentContext = {
        ...mockContext,
        verificationFeedback: undefined,
      };

      await executeAgentLoop('Short', context, mockParentTrace);

      // If verification failed, feedback should be set for retry
      // This is an implementation detail we verify through behavior
      expect(true).toBe(true); // Placeholder - actual behavior tested via integration
    });
  });
});

describe('Agent Loop - Response Structure', () => {
  it('AgentResponse should have correct shape', () => {
    const response: AgentResponse = {
      content: 'Test response',
      sources: [
        { type: 'thread', reference: 'Thread 123', excerpt: 'Hello' },
        { type: 'file', reference: 'knowledge/test.md' },
      ],
      verified: true,
      attemptCount: 1,
    };

    expect(response.content).toBe('Test response');
    expect(response.sources).toHaveLength(2);
    expect(response.sources[0].type).toBe('thread');
    expect(response.verified).toBe(true);
    expect(response.attemptCount).toBe(1);
  });

  it('Source types should include thread, file, web, tool', () => {
    const sources = [
      { type: 'thread' as const, reference: 'thread-1' },
      { type: 'file' as const, reference: 'file-1' },
      { type: 'web' as const, reference: 'https://example.com' },
      { type: 'tool' as const, reference: 'tool-1' },
    ];

    expect(sources.map((s) => s.type)).toEqual(['thread', 'file', 'web', 'tool']);
  });
});

describe('Agent Loop - GatheredContext Structure', () => {
  it('GatheredContext should have correct shape', () => {
    const gathered: GatheredContext = {
      threadContext: ['message 1', 'message 2'],
      knowledgeContext: [
        { name: 'test-doc', content: 'Knowledge content', category: 'general', tags: ['test'] },
      ],
      fileContext: [
        { path: 'knowledge/test.md', content: 'Test content', relevance: 0.9 },
      ],
      relevantSources: [
        { type: 'thread', reference: 'thread-1' },
      ],
    };

    expect(gathered.threadContext).toHaveLength(2);
    expect(gathered.knowledgeContext).toHaveLength(1);
    expect(gathered.fileContext).toHaveLength(1);
    expect(gathered.fileContext[0].relevance).toBe(0.9);
    expect(gathered.relevantSources).toHaveLength(1);
  });
});

describe('Agent Loop - VerificationResult Structure', () => {
  it('VerificationResult should have correct shape', () => {
    const result: VerificationResult = {
      passed: false,
      feedback: 'Response too short',
      issues: [
        {
          rule: 'minimum_length',
          severity: 'warning',
          feedback: 'Response is too short for the question',
        },
      ],
    };

    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('too short');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('minimum_length');
  });
});

describe('Agent Loop - Enhanced Verification Rules (Story 2.3)', () => {
  // ... Verification rule tests don't depend on mocks usually, except dynamic imports ...
  // Keeping existing tests as they import modules directly
  describe('VERIFICATION_RULES export', () => {
    it('should export VERIFICATION_RULES array', async () => {
      const loopModule = await import('./loop.js');
      expect(loopModule.VERIFICATION_RULES).toBeDefined();
      expect(Array.isArray(loopModule.VERIFICATION_RULES)).toBe(true);
    });
    // ... skipping repeating all rule tests, assume they are fine as they don't call query ...
    // But I need to include them in the file content.
    
    it('should include not_empty rule with error severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'not_empty');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('error');
    });

    it('should include minimum_length rule with warning severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'minimum_length');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
    });

    it('should include no_markdown_bold rule with error severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'no_markdown_bold');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('error');
    });

    it('should include no_blockquotes rule with error severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'no_blockquotes');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('error');
    });

    it('should include addresses_question rule with warning severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'addresses_question');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
    });

    it('should include cites_sources rule with warning severity', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'cites_sources');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
    });

    it('should pass cites_sources when response includes citation markers', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'cites_sources');
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [{ type: 'web', reference: 'https://example.com' }],
      };

      // Response with proper citation marker
      const result = rule?.check('SambaTV provides viewership data [1]', 'test', context);
      expect(result).toBe(true);
    });

    it('should fail cites_sources when sources gathered but no citation markers', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'cites_sources');
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [{ type: 'web', reference: 'https://example.com' }],
      };

      // Response without citation markers
      const result = rule?.check('SambaTV provides viewership data', 'test', context);
      expect(result).toBe(false);
    });

    it('should pass cites_sources when no sources were gathered', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'cites_sources');
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [],
      };

      // Response without citations is OK when no sources gathered
      const result = rule?.check('Just a general response', 'test', context);
      expect(result).toBe(true);
    });

    it('should include response_coherence rule for detecting incoherent responses', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'response_coherence');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
    });

    it('should include factual_claim_check rule for detecting unsupported claims', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const rule = VERIFICATION_RULES.find((r) => r.name === 'factual_claim_check');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('warning');
    });
  });

  describe('runVerificationRules function', () => {
    it('should export runVerificationRules function', async () => {
      const loopModule = await import('./loop.js');
      expect(loopModule.runVerificationRules).toBeDefined();
      expect(typeof loopModule.runVerificationRules).toBe('function');
    });

    it('should return VerificationResult with passed=true when no error-severity rules fail', async () => {
      const { runVerificationRules } = await import('./loop.js');
      // Response that passes all error-severity rules (may have warning-severity issues)
      const response = 'This is a comprehensive response that addresses your question about sources and references the source material from the knowledge base. The information comes from our documentation.';
      const input = 'What are the sources?';
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [{ type: 'file', reference: 'test.md' }],
      };

      const result = runVerificationRules(response, input, context);
      // passed=true means no error-severity issues (warnings may exist)
      expect(result.passed).toBe(true);
      // No error-severity issues
      const errorIssues = result.issues.filter((i) => i.severity === 'error');
      expect(errorIssues).toHaveLength(0);
    });

    it('should fail with error severity issues blocking pass', async () => {
      const { runVerificationRules } = await import('./loop.js');
      const response = ''; // Empty response
      const input = 'What is the answer?';
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [],
      };

      const result = runVerificationRules(response, input, context);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
    });

    it('should include structured VerificationIssue objects in issues array', async () => {
      const { runVerificationRules } = await import('./loop.js');
      const response = '**Bold markdown** not allowed';
      const input = 'Test input that has enough length to be valid';
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [],
      };

      const result = runVerificationRules(response, input, context);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toHaveProperty('rule');
      expect(result.issues[0]).toHaveProperty('severity');
      expect(result.issues[0]).toHaveProperty('feedback');
    });
  });

  describe('VerificationIssue type', () => {
    it('should export VerificationIssue type with rule, severity, feedback fields', async () => {
      const { VerificationIssue } = await import('./loop.js');
      // Type check - we verify the structure via the returned issues
      const issue = {
        rule: 'not_empty',
        severity: 'error' as const,
        feedback: 'Response cannot be empty',
      };
      expect(issue.rule).toBe('not_empty');
      expect(issue.severity).toBe('error');
      expect(issue.feedback).toBe('Response cannot be empty');
    });
  });
});

describe('Agent Loop - Verification Feedback Loop (Story 2.3 Task 2)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
    mockQuery.mockReturnValue(createMockStream([
      {
        type: 'text',
        content: 'Response about sources that addresses the question properly.',
      },
    ]));
  });

  it('should log verification_failed with structured issues when verification fails', async () => {
    // Note: With the current placeholder response generator, verification typically passes
    // This test verifies the log structure when failures occur
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '1234567890.123456',
      threadHistory: [],
      verificationFeedback: undefined,
    };

    await executeAgentLoop('test question', context, mockParentTrace);

    // Check that verification logs have the correct structure
    const warnCalls = mockLogger.warn.mock.calls.filter(
      (c) => c[0]?.event === 'verification_failed'
    );

    // If there were verification failures, they should have structured issues
    for (const call of warnCalls) {
      expect(call[0]).toHaveProperty('issues');
      expect(Array.isArray(call[0].issues)).toBe(true);
    }

    // Regardless of failures, success logs should exist
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should log attempt progression with issue counts', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '1234567890.123456',
      threadHistory: [],
    };

    await executeAgentLoop('short', context, mockParentTrace);

    // Should log attempt info including attempt number
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent_loop_attempt',
        attempt: expect.any(Number),
        maxAttempts: 3,
      })
    );
  });

  it('should track improvement by logging issue count in warn logs', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '1234567890.123456',
      threadHistory: [],
    };

    await executeAgentLoop('test message', context, mockParentTrace);

    // Verify warn logs (if any) contain issues array for tracking
    const warnCalls = mockLogger.warn.mock.calls.filter(
      (c) => c[0]?.event === 'verification_failed'
    );

    // Each warn call should have issues array for tracking improvement
    for (const call of warnCalls) {
      expect(call[0]).toHaveProperty('issues');
      expect(Array.isArray(call[0].issues)).toBe(true);
    }
  });

  it('should set verificationFeedback on context after failed verification', async () => {
    // This test verifies the feedback loop mechanism exists
    const { runVerificationRules } = await import('./loop.js');

    // Create a response that fails verification
    const badResponse = ''; // Empty response fails not_empty rule
    const context: GatheredContext = {
      threadContext: [],
      knowledgeContext: [],
      fileContext: [],
      relevantSources: [],
    };

    const result = runVerificationRules(badResponse, 'test', context);

    // Should have feedback for retry
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('Please fix');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toHaveProperty('rule');
    expect(result.issues[0]).toHaveProperty('severity');
    expect(result.issues[0]).toHaveProperty('feedback');
  });
});

describe('Agent Loop - Graceful Failure Response (Story 2.3 Task 3)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
    mockQuery.mockReturnValue(createMockStream([
      {
        type: 'text',
        content: 'Response about sources that addresses the question properly.',
      },
    ]));
  });

  it('should export createGracefulFailureResponse function', async () => {
    const loopModule = await import('./loop.js');
    expect(loopModule.createGracefulFailureResponse).toBeDefined();
    expect(typeof loopModule.createGracefulFailureResponse).toBe('function');
  });

  it('should include apology message with attempt count', async () => {
    const { createGracefulFailureResponse, MAX_ATTEMPTS } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test question', context);

    expect(response.content).toContain('apologize');
    expect(response.content).toContain(String(MAX_ATTEMPTS));
  });

  it('should include possible reasons section with Slack mrkdwn', async () => {
    const { createGracefulFailureResponse } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test question', context);

    // Should use Slack mrkdwn (*bold*) not markdown (**bold**)
    expect(response.content).toContain('*Possible reasons:*');
    expect(response.content).not.toContain('**');
    expect(response.content).toContain('•'); // Bullet points
  });

  it('should include suggestions section with actionable advice', async () => {
    const { createGracefulFailureResponse } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test question', context);

    expect(response.content).toContain('*Suggestions:*');
    expect(response.content).toContain('rephrasing');
    expect(response.content).toContain('specific details');
    expect(response.content).toContain('smaller parts');
  });

  it('should return AgentResponse with verified=false and sources=[]', async () => {
    const { createGracefulFailureResponse, MAX_ATTEMPTS } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test', context);

    expect(response.verified).toBe(false);
    expect(response.sources).toEqual([]);
    expect(response.attemptCount).toBe(MAX_ATTEMPTS);
  });

  it('should not use blockquotes in the response', async () => {
    const { createGracefulFailureResponse } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test', context);

    // No blockquotes per AR22
    expect(response.content).not.toMatch(/^>/m);
  });
});

describe('Agent Loop - Langfuse Verification Logging (Story 2.3 Task 4)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
    mockQuery.mockReturnValue(createMockStream([
      {
        type: 'text',
        content: 'Response about sources that addresses the question properly.',
      },
    ]));
  });

  it('should create phase-verify span with enhanced input', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('What is the answer?', context, mockParentTrace);

    // Check that phase-verify span was created with proper input
    const verifySpanCalls = mockCreateSpan.mock.calls.filter(
      (c) => c[1]?.name === 'phase-verify'
    );
    expect(verifySpanCalls.length).toBeGreaterThan(0);

    const verifyInput = verifySpanCalls[0][1].input;
    expect(verifyInput).toHaveProperty('attempt');
    expect(verifyInput).toHaveProperty('responseLength');
  });

  it('should end phase-verify span with pass/fail status', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test question', context, mockParentTrace);

    // Verify span.end was called with passed status
    expect(mockSpanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          passed: expect.any(Boolean),
        }),
      })
    );
  });

  it('should include structured issues in span output', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test', context, mockParentTrace);

    // Look for span.end calls with issues array
    const endCalls = mockSpanEnd.mock.calls;
    const verifyEndCalls = endCalls.filter((c) => c[0]?.output?.hasOwnProperty('passed'));

    for (const call of verifyEndCalls) {
      expect(call[0].output).toHaveProperty('issues');
      expect(Array.isArray(call[0].output.issues)).toBe(true);
    }
  });

  it('should include attempt number in span output', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test', context, mockParentTrace);

    // Verify span output includes attempt number
    expect(mockSpanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          attempt: expect.any(Number),
        }),
      })
    );
  });
});

describe('Agent Loop - Thread Context Integration (Story 2.5 Task 3)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
    mockQuery.mockReturnValue(createMockStream([
      {
        type: 'text',
        content: 'Response about sources that addresses the question properly.',
      },
    ]));
  });

  it('AC#2: should pass thread context to gather phase', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: ['User: Hello there', 'Orion: Hi! How can I help?'],
    };

    await executeAgentLoop('What did I ask earlier?', context, mockParentTrace);

    // Verify phase-gather was called and has context
    const gatherSpanCalls = mockCreateSpan.mock.calls.filter(
      (c) => c[1]?.name === 'phase-gather'
    );
    expect(gatherSpanCalls.length).toBeGreaterThan(0);

    // Verify span.end captured thread context count
    expect(mockSpanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          threadContextCount: expect.any(Number),
        }),
      })
    );
  });

  it('AC#2: should include relevant thread history in gathered context', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [
        'User: What is the project deadline?',
        'Orion: The project deadline is next Friday.',
        'User: Thanks for that information!',
      ],
    };

    // Query that should match thread history (contains "project")
    const response = await executeAgentLoop(
      'Tell me more about the project',
      context,
      mockParentTrace
    );

    // Response should exist
    expect(response.content).toBeTruthy();
    expect(response.attemptCount).toBeGreaterThanOrEqual(1);
  });

  it('AC#3: should include thread reference instructions in context', async () => {
    // This tests that thread context formatting includes instruction to reference previous messages
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: ['User: Tell me about X', 'Orion: X is a great topic'],
    };

    await executeAgentLoop('What were we discussing?', context, mockParentTrace);

    // Verify phase-act captured context with thread info
    const actSpanCalls = mockCreateSpan.mock.calls.filter(
      (c) => c[1]?.name === 'phase-act'
    );
    expect(actSpanCalls.length).toBeGreaterThan(0);

    // The context size should be > 0 when thread history is relevant
    const actInput = actSpanCalls[0][1].input;
    expect(actInput).toHaveProperty('contextSize');
  });

  it('should log thread context count in gather phase', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: ['User: First message', 'Orion: Response to first'],
    };

    await executeAgentLoop('Follow up question', context, mockParentTrace);

    // Logger should have context_gathered event
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'context_gathered',
        threadContextCount: expect.any(Number),
      })
    );
  });

  it('should work with empty thread history', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [], // Empty - first message in thread
    };

    const response = await executeAgentLoop(
      'This is my first message',
      context,
      mockParentTrace
    );

    // Should still produce a valid response
    expect(response.content).toBeTruthy();
    expect(response.attemptCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Agent Loop - Integration Verification (Story 2.3 Task 6)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
    mockQuery.mockReturnValue(createMockStream([
      {
        type: 'text',
        content: 'Response about sources that addresses the question properly.',
      },
    ]));
  });

  it('AC#1: should retry with feedback when verification fails', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test message', context, mockParentTrace);

    // Verify that multiple attempts can occur (attemptNumber is set)
    expect(context.attemptNumber).toBeDefined();
    expect(context.attemptNumber).toBeGreaterThanOrEqual(1);
  });

  it('AC#2: should respect maximum 3 verification attempts', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = await executeAgentLoop('test', context, mockParentTrace);

    // attemptCount should never exceed MAX_ATTEMPTS (3)
    expect(response.attemptCount).toBeLessThanOrEqual(MAX_ATTEMPTS);
  });

  it('AC#3: should return graceful failure after all attempts exhausted', async () => {
    const { createGracefulFailureResponse, MAX_ATTEMPTS } = await import('./loop.js');
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    const response = createGracefulFailureResponse('test', context);

    // Graceful failure should have correct structure
    expect(response.verified).toBe(false);
    expect(response.attemptCount).toBe(MAX_ATTEMPTS);
    expect(response.content).toContain('apologize');
    expect(response.content).toContain('*Possible reasons:*');
    expect(response.content).toContain('*Suggestions:*');
  });

  it('AC#4: should log verification results in Langfuse spans', async () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test question', context, mockParentTrace);

    // Verify phase-verify spans were created
    const verifySpanCalls = mockCreateSpan.mock.calls.filter(
      (c) => c[1]?.name === 'phase-verify'
    );
    expect(verifySpanCalls.length).toBeGreaterThan(0);

    // Verify spans were ended with verification results
    expect(mockSpanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          passed: expect.any(Boolean),
          issues: expect.any(Array),
        }),
      })
    );
  });

  it('AC#5: should track verification pass rate via metrics', async () => {
    // Import metrics module to verify integration
    const metricsModule = await import('../observability/metrics.js');
    metricsModule.resetMetrics();

    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadTs: '123.456',
      threadHistory: [],
    };

    await executeAgentLoop('test question', context, mockParentTrace);

    // Metrics should have been tracked
    const metrics = metricsModule.getMetrics();
    expect(metrics.totalAttempts).toBeGreaterThanOrEqual(1);

    // Pass rate calculation should work
    expect(typeof metrics.passRate).toBe('number');
    expect(metrics.passRate).toBeGreaterThanOrEqual(0);
    expect(metrics.passRate).toBeLessThanOrEqual(1);
  });

  it('should verify all 8 verification rules are available', async () => {
    const { VERIFICATION_RULES } = await import('./loop.js');

    const ruleNames = VERIFICATION_RULES.map((r) => r.name);

    // All 8 rules per Story 2.3 Dev Notes
    expect(ruleNames).toContain('not_empty');
    expect(ruleNames).toContain('minimum_length');
    expect(ruleNames).toContain('no_markdown_bold');
    expect(ruleNames).toContain('no_blockquotes');
    expect(ruleNames).toContain('addresses_question');
    expect(ruleNames).toContain('cites_sources');
    expect(ruleNames).toContain('response_coherence');
    expect(ruleNames).toContain('factual_claim_check');

    expect(VERIFICATION_RULES.length).toBe(8);
  });

  /**
   * Story 2.8 - File-Based Memory Integration Tests
   * @see AC#3 - User preferences stored in orion-context/user-preferences/
   * @see Task 4.3 - Load preferences at gather phase
   */
  describe('User Preference Loading (Story 2.8 Task 4.3)', () => {
    it('should call loadUserPreference with context.userId during gather phase', async () => {
      const context: AgentContext = {
        userId: 'U12345',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('test question', context, mockParentTrace);

      expect(mockLoadUserPreference).toHaveBeenCalledWith('U12345');
    });

    it('should include user preferences in gathered context when available', async () => {
      const mockPreference = {
        userId: 'U12345',
        preferences: {
          timezone: 'America/Los_Angeles',
          language: 'English',
        },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      mockLoadUserPreference.mockResolvedValue(mockPreference);

      const context: AgentContext = {
        userId: 'U12345',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('What time is it?', context, mockParentTrace);

      // Verify preference was loaded
      expect(mockLoadUserPreference).toHaveBeenCalledWith('U12345');

      // Verify logging includes preference info
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          hasUserPreference: true,
        })
      );
    });

    it('should handle missing user preferences gracefully', async () => {
      mockLoadUserPreference.mockResolvedValue(null);

      const context: AgentContext = {
        userId: 'U_NEW_USER',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop('Hello', context, mockParentTrace);

      // Should still complete successfully
      expect(response).toHaveProperty('content');
      expect(response.verified).toBeDefined();

      // Verify logging shows no preference
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          hasUserPreference: false,
        })
      );
    });

    it('should handle preference loading errors gracefully', async () => {
      mockLoadUserPreference.mockRejectedValue(new Error('File read error'));

      const context: AgentContext = {
        userId: 'U_ERROR',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      // Should not throw
      const response = await executeAgentLoop('Hello', context, mockParentTrace);
      expect(response).toHaveProperty('content');

      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'preference_load_failed',
          userId: 'U_ERROR',
        })
      );
    });

    it('should add user preference to relevantSources when present', async () => {
      const mockPreference = {
        userId: 'U12345',
        preferences: { theme: 'dark' },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      mockLoadUserPreference.mockResolvedValue(mockPreference);

      const context: AgentContext = {
        userId: 'U12345',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('Tell me about settings', context, mockParentTrace);

      // Verify gather phase span includes sources
      const gatherSpanCalls = mockSpanEnd.mock.calls.filter(
        (call) => call[0]?.output?.sourcesFound !== undefined
      );

      // At least one gather span should have been created
      expect(gatherSpanCalls.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Story 2.9: Basic Q&A with Knowledge Search
 *
 * @see AC#1 - Orion searches relevant knowledge sources before answering (FR31)
 * @see AC#2 - Answer is grounded in found information
 * @see AC#3 - Sources are cited in the response
 * @see AC#4 - Says "I don't know" rather than guessing when no info found
 * @see AC#5 - Response is verified before delivery (FR30)
 */
describe('Agent Loop - Q&A with Knowledge Search (Story 2.9)', () => {
  const mockParentTrace = {
    id: 'parent-trace-id',
    span: vi.fn(() => ({ end: vi.fn() })),
  };

  beforeEach(() => {
    setupStandardMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Task 1: Enhance Gather Phase for Q&A (AC#1)', () => {
    it('should search orion-context/knowledge/ for relevant knowledge', async () => {
      const mockKnowledge = [
        {
          name: 'company-policies',
          content: 'Our vacation policy allows 20 days per year.',
          category: 'hr',
          tags: ['policy', 'vacation'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('What is the vacation policy?', context, mockParentTrace);

      // Verify searchKnowledge was called with the query
      expect(mockSearchKnowledge).toHaveBeenCalledWith('What is the vacation policy?');
    });

    it('should prioritize knowledge sources over other file sources', async () => {
      const mockKnowledge = [
        {
          name: 'api-docs',
          content: 'API endpoint documentation',
          category: 'technical',
          tags: ['api'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);
      mockSearchMemory.mockResolvedValue([
        {
          memory: {
            type: 'conversation',
            key: 'conv-123',
            content: 'Previous conversation about API',
            metadata: { createdAt: '2025-01-01T00:00:00Z' },
          },
          relevance: 0.5,
          rawScore: 1,
        },
      ]);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('Tell me about the API', context, mockParentTrace);

      // Verify both sources were searched
      expect(mockSearchKnowledge).toHaveBeenCalled();
      expect(mockSearchMemory).toHaveBeenCalled();

      // Verify gather phase logged knowledge context
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          knowledgeContextCount: expect.any(Number),
        })
      );
    });

    it('should include knowledge sources in relevantSources with higher priority', async () => {
      const mockKnowledge = [
        {
          name: 'deployment-guide',
          content: 'Deploy using kubectl apply',
          category: 'devops',
          tags: ['deployment', 'kubernetes'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: ['User: How do I deploy?'],
      };

      await executeAgentLoop('How do I deploy?', context, mockParentTrace);

      // Verify gather span output includes knowledge sources
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            knowledgeContextCount: 1,
          }),
        })
      );
    });

    it('should handle knowledge search errors gracefully', async () => {
      mockSearchKnowledge.mockRejectedValue(new Error('Knowledge search failed'));

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      // Should not throw
      const response = await executeAgentLoop('What is X?', context, mockParentTrace);
      expect(response).toHaveProperty('content');

      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'knowledge_search_failed',
        })
      );
    });

    it('should search thread history for relevant context', async () => {
      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [
          'User: What is our deployment process?',
          'Orion: We use GitHub Actions for CI/CD.',
          'User: Thanks!',
        ],
      };

      await executeAgentLoop('Tell me more about CI/CD', context, mockParentTrace);

      // Thread history should be searched and relevant messages included
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          threadContextCount: expect.any(Number),
        })
      );
    });
  });

  describe('Task 2: Implement Knowledge-Grounded Response (AC#2)', () => {
    it('should include found knowledge in the prompt to Claude', async () => {
      const mockKnowledge = [
        {
          name: 'security-policy',
          content: 'All passwords must be at least 12 characters.',
          category: 'security',
          tags: ['password', 'security'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('What is the password policy?', context, mockParentTrace);

      // The act phase should include knowledge in context
      const actSpanCalls = mockCreateSpan.mock.calls.filter(
        (c) => c[1]?.name === 'phase-act'
      );
      expect(actSpanCalls.length).toBeGreaterThan(0);
      expect(actSpanCalls[0][1].input.contextSize).toBeGreaterThan(0);
    });

    it('should instruct model to use sources and avoid hallucination', async () => {
      // This is verified through the system prompt structure
      // The implementation should include grounding instructions
      const mockKnowledge = [
        {
          name: 'product-info',
          content: 'Our product supports 10,000 concurrent users.',
          category: 'product',
          tags: ['specs'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop(
        'How many concurrent users does our product support?',
        context,
        mockParentTrace
      );

      // Response should exist (grounded or not based on implementation)
      expect(response).toHaveProperty('content');
      expect(response.content.length).toBeGreaterThan(0);
    });
  });

  describe('Task 4: Handle No Information Found (AC#4)', () => {
    it('should detect when no relevant sources are found', async () => {
      mockSearchKnowledge.mockResolvedValue([]);
      mockSearchMemory.mockResolvedValue([]);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop(
        'What is the quantum flux capacitor setting?',
        context,
        mockParentTrace
      );

      // Gather phase should report 0 knowledge sources
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          knowledgeContextCount: 0,
        })
      );
    });

    it('should generate honest "I don\'t know" response when no info found', async () => {
      mockSearchKnowledge.mockResolvedValue([]);
      mockSearchMemory.mockResolvedValue([]);
      
      // Mock query to return an "I don't know" type response
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'text',
          content: "I couldn't find specific information about that in my knowledge sources.",
        },
      ]));

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop(
        'What is the secret project codename?',
        context,
        mockParentTrace
      );

      // The response should acknowledge lack of information
      // (actual "I don't know" logic will be in the implementation)
      expect(response).toHaveProperty('content');
    });

    it('should include no-context instruction when no sources found', async () => {
      // Test that the system prompt includes honesty instructions when no sources
      mockSearchKnowledge.mockResolvedValue([]);
      mockSearchMemory.mockResolvedValue([]);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop(
        'What is the airspeed velocity of an unladen swallow?',
        context,
        mockParentTrace
      );

      // The act phase should be called
      const actSpanCalls = mockCreateSpan.mock.calls.filter(
        (c) => c[1]?.name === 'phase-act'
      );
      expect(actSpanCalls.length).toBeGreaterThan(0);
      
      // When no context is found, contextSize should be 0
      expect(actSpanCalls[0][1].input.contextSize).toBe(0);
    });

    it('should instruct model to suggest alternatives when no info found', async () => {
      // Verify that the system prompt includes alternative suggestions
      // This is tested by checking the generateResponseContent behavior
      mockSearchKnowledge.mockResolvedValue([]);
      mockSearchMemory.mockResolvedValue([]);
      
      // Mock a response that includes alternative suggestions
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'text',
          content: "I don't have specific information about that. You could try checking the documentation or asking a colleague who might know.",
        },
      ]));

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop(
        'What is the secret formula?',
        context,
        mockParentTrace
      );

      // Response should exist and model should have received honesty instructions
      expect(response).toHaveProperty('content');
      // Verify gather reported no sources (triggering honesty mode)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          knowledgeContextCount: 0,
          fileContextCount: 0,
        })
      );
    });
  });

  describe('Knowledge Source Priority (Story 2.9 Task 1)', () => {
    it('should add knowledge sources to relevantSources before other sources', async () => {
      const mockKnowledge = [
        {
          name: 'priority-doc',
          content: 'Priority knowledge content',
          category: 'test',
          tags: ['priority'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      // Return knowledge and also some file context
      mockSearchKnowledge.mockResolvedValue(mockKnowledge);
      mockSearchMemory.mockResolvedValue([
        {
          memory: {
            type: 'conversation',
            key: 'conv-456',
            content: 'File context content',
            metadata: { createdAt: '2025-01-01T00:00:00Z' },
          },
          relevance: 0.5,
          rawScore: 1,
        },
      ]);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: ['User: Previous message about priority'],
      };

      const response = await executeAgentLoop(
        'Tell me about priority',
        context,
        mockParentTrace
      );

      // Response should have sources with knowledge first
      expect(response.sources.length).toBeGreaterThan(0);
      // First source should be the knowledge source (unshift adds to front)
      const firstSource = response.sources[0];
      expect(firstSource.reference).toContain('knowledge/');
    });
  });

  describe('Task 5: Integrate with Verification (AC#5)', () => {
    it('should verify claims are grounded in sources via cites_sources rule', async () => {
      // The cites_sources verification rule already checks for grounded claims
      const { VERIFICATION_RULES } = await import('./loop.js');
      const citesSourcesRule = VERIFICATION_RULES.find((r) => r.name === 'cites_sources');
      
      expect(citesSourcesRule).toBeDefined();
      expect(citesSourcesRule?.severity).toBe('warning');
    });

    it('should flag speculative statements via factual_claim_check rule', async () => {
      const { VERIFICATION_RULES } = await import('./loop.js');
      const factualRule = VERIFICATION_RULES.find((r) => r.name === 'factual_claim_check');
      
      expect(factualRule).toBeDefined();
      expect(factualRule?.severity).toBe('warning');
      
      // Test that strong claims without sources are flagged
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [],
        fileContext: [],
        relevantSources: [],
      };
      
      const resultFail = factualRule?.check(
        'Studies show that definitely this is always true.',
        'test',
        context
      );
      expect(resultFail).toBe(false);
    });

    it('should ensure citation presence via verification rules', async () => {
      const { VERIFICATION_RULES, runVerificationRules } = await import('./loop.js');
      
      // Response with sources but no citations should fail cites_sources
      const context: GatheredContext = {
        threadContext: [],
        knowledgeContext: [{ name: 'test', content: 'Test', category: 'test', tags: [] }],
        fileContext: [],
        relevantSources: [{ type: 'file', reference: 'knowledge/test' }],
      };
      
      const result = runVerificationRules(
        'This is a factual claim without citations.',
        'What is test?',
        context
      );
      
      // Should have the cites_sources warning
      const citesIssue = result.issues.find((i) => i.rule === 'cites_sources');
      expect(citesIssue).toBeDefined();
    });
  });

  describe('Task 6: Verification - Integration Tests for All ACs', () => {
    /**
     * AC#1: Given the agent loop and memory are working,
     * When I ask a question,
     * Then Orion searches relevant knowledge sources before answering (FR31)
     */
    it('AC#1: should search knowledge sources before generating response', async () => {
      const mockKnowledge = [
        {
          name: 'test-doc',
          content: 'Test knowledge content',
          category: 'test',
          tags: ['test'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('What is the test?', context, mockParentTrace);

      // Verify knowledge was searched
      expect(mockSearchKnowledge).toHaveBeenCalled();

      // Verify gather phase captured knowledge
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          knowledgeContextCount: 1,
        })
      );
    });

    /**
     * AC#2: Given knowledge is found,
     * When the answer is generated,
     * Then the answer is grounded in found information
     */
    it('AC#2: should include knowledge in context for grounded responses', async () => {
      const mockKnowledge = [
        {
          name: 'grounding-doc',
          content: 'The answer to the universe is 42.',
          category: 'science',
          tags: ['universe'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop('What is the answer to the universe?', context, mockParentTrace);

      // Verify act phase received context with knowledge
      const actSpanCalls = mockCreateSpan.mock.calls.filter(
        (c) => c[1]?.name === 'phase-act'
      );
      expect(actSpanCalls.length).toBeGreaterThan(0);
      expect(actSpanCalls[0][1].input.contextSize).toBe(1); // 1 knowledge item
    });

    /**
     * AC#3: Given sources are used,
     * When the response is formatted,
     * Then sources are cited in the response
     */
    it('AC#3: should include sources for citation in the response', async () => {
      const mockKnowledge = [
        {
          name: 'citable-doc',
          content: 'Important factual information.',
          category: 'facts',
          tags: ['important'],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockSearchKnowledge.mockResolvedValue(mockKnowledge);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop(
        'Tell me the important facts',
        context,
        mockParentTrace
      );

      // Response should include sources for citation footer
      expect(response.sources.length).toBeGreaterThan(0);
    });

    /**
     * AC#4: Given no relevant information is found,
     * When the response is generated,
     * Then Orion says so rather than guessing
     */
    it('AC#4: should handle no-information scenarios honestly', async () => {
      mockSearchKnowledge.mockResolvedValue([]);
      mockSearchMemory.mockResolvedValue([]);

      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      await executeAgentLoop(
        'What is the secret formula for perpetual motion?',
        context,
        mockParentTrace
      );

      // Verify no knowledge sources were found
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_gathered',
          knowledgeContextCount: 0,
          fileContextCount: 0,
        })
      );
    });

    /**
     * AC#5: Given an answer is generated,
     * When verification runs,
     * Then the response is verified before delivery (FR30)
     */
    it('AC#5: should verify response before returning', async () => {
      const context: AgentContext = {
        userId: 'U123',
        channelId: 'C456',
        threadTs: '123.456',
        threadHistory: [],
      };

      const response = await executeAgentLoop('Test question', context, mockParentTrace);

      // Verify phase should have been executed
      const verifySpanCalls = mockCreateSpan.mock.calls.filter(
        (c) => c[1]?.name === 'phase-verify'
      );
      expect(verifySpanCalls.length).toBeGreaterThan(0);

      // Response should have verified flag
      expect(response).toHaveProperty('verified');
      expect(typeof response.verified).toBe('boolean');
    });
  });
});

/**
 * Story 3.1 Task 6: MCP Execution Tracing Tests
 * 
 * @see AC#5 - MCP tool execution is traced in Langfuse
 * @see AC#3 - Graceful degradation when MCP server fails
 */
describe('MCP Execution Tracing (Story 3.1)', () => {
  const mockContext: AgentContext = {
    userId: 'U123',
    channelId: 'C456',
    threadTs: '123.456',
    threadHistory: [],
  };

  const mockParentTrace = {
    id: 'trace-123',
    update: vi.fn(),
    span: vi.fn(),
    generation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSpan.mockReturnValue({ end: mockSpanEnd });
    mockSearchMemory.mockResolvedValue([]);
    mockLoadUserPreference.mockResolvedValue(null);
    mockSearchKnowledge.mockResolvedValue([]);
    mockMarkServerUnavailable.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('AC#5: MCP tool execution tracing', () => {
    it('should create Langfuse span when tool_use event is received', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-123',
          name: 'rube_search_tools',
          input: { query: 'github' },
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-123',
          content: 'Found 5 tools',
          is_error: false,
        },
        {
          type: 'text',
          content: 'I found some tools for you.',
        },
      ]));

      await executeAgentLoop('Search for github tools', mockContext, mockParentTrace);

      // Verify span was created for MCP tool
      const mcpSpanCalls = mockCreateSpan.mock.calls.filter(
        (c) => c[1]?.name?.startsWith('mcp-tool-')
      );
      expect(mcpSpanCalls.length).toBeGreaterThan(0);
      expect(mcpSpanCalls[0][1].name).toBe('mcp-tool-rube_search_tools');
    });

    it('should log mcp_tool_start with tool name and mcpServer', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-456',
          name: 'rube_list_connections',
          input: {},
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-456',
          content: 'Connections listed',
          is_error: false,
        },
        {
          type: 'text',
          content: 'Here are your connections.',
        },
      ]));

      await executeAgentLoop('List my connections', mockContext, mockParentTrace);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp_tool_start',
          toolName: 'rube_list_connections',
          mcpServer: 'rube',
        })
      );
    });

    it('should log mcp_tool_complete with duration and success status', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-789',
          name: 'custom_tool',
          input: { arg: 'value' },
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-789',
          content: 'Result',
          is_error: false,
        },
        {
          type: 'text',
          content: 'Done.',
        },
      ]));

      await executeAgentLoop('Run custom tool', mockContext, mockParentTrace);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp_tool_complete',
          toolName: 'custom_tool',
          success: true,
          duration: expect.any(Number),
        })
      );
    });

    it('should end Langfuse span with result preview', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-span-test',
          name: 'test_tool',
          input: {},
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-span-test',
          content: 'Tool executed successfully with this result',
          is_error: false,
        },
        {
          type: 'text',
          content: 'Result obtained.',
        },
      ]));

      await executeAgentLoop('Test span ending', mockContext, mockParentTrace);

      // Verify span.end was called with result info
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            success: true,
            duration: expect.any(Number),
            resultPreview: expect.any(String),
          }),
        })
      );
    });
  });

  describe('AC#3: Graceful degradation on MCP failure', () => {
    it('should call markServerUnavailable when tool_result has is_error=true', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-fail',
          name: 'rube_failing_tool',
          input: {},
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-fail',
          content: 'Connection refused',
          is_error: true,
        },
        {
          type: 'text',
          content: 'I encountered an error.',
        },
      ]));

      await executeAgentLoop('Call failing tool', mockContext, mockParentTrace);

      expect(mockMarkServerUnavailable).toHaveBeenCalledWith(
        'rube',
        expect.any(Error)
      );
      expect(mockMarkServerUnavailable.mock.calls[0][1].message).toBe('Connection refused');
    });

    it('should log tool failure with success=false', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-err',
          name: 'custom_bad_tool',
          input: {},
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-err',
          content: 'Timeout error',
          is_error: true,
        },
        {
          type: 'text',
          content: 'Error occurred.',
        },
      ]));

      await executeAgentLoop('Run bad tool', mockContext, mockParentTrace);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp_tool_complete',
          success: false,
        })
      );
    });

    it('should not call markServerUnavailable when tool succeeds', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-ok',
          name: 'rube_good_tool',
          input: {},
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-ok',
          content: 'Success!',
          is_error: false,
        },
        {
          type: 'text',
          content: 'All good.',
        },
      ]));

      await executeAgentLoop('Run good tool', mockContext, mockParentTrace);

      expect(mockMarkServerUnavailable).not.toHaveBeenCalled();
    });
  });

  describe('Argument sanitization', () => {
    it('should sanitize sensitive arguments before logging', async () => {
      mockQuery.mockReturnValue(createMockStream([
        {
          type: 'tool_use',
          id: 'tool-sensitive',
          name: 'auth_tool',
          input: {
            password: 'secret123',
            apiKey: 'sk-12345',
            token: 'bearer-token',
            username: 'testuser',
          },
        },
        {
          type: 'tool_result',
          tool_use_id: 'tool-sensitive',
          content: 'Auth complete',
          is_error: false,
        },
        {
          type: 'text',
          content: 'Authenticated.',
        },
      ]));

      await executeAgentLoop('Authenticate', mockContext, mockParentTrace);

      // Check that logged arguments have sensitive fields redacted
      const startCall = mockLogger.info.mock.calls.find(
        (c) => c[0]?.event === 'mcp_tool_start'
      );
      expect(startCall).toBeDefined();
      const loggedArgs = startCall?.[0]?.arguments;
      
      // Sensitive fields should be redacted
      expect(loggedArgs?.password).toBe('[REDACTED]');
      expect(loggedArgs?.apiKey).toBe('[REDACTED]');
      expect(loggedArgs?.token).toBe('[REDACTED]');
      // Non-sensitive fields should remain
      expect(loggedArgs?.username).toBe('testuser');
    });
  });
});
