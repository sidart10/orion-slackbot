/**
 * Test Data Factories
 *
 * Central export for all test factory modules.
 *
 * @see docs/testing-standards.md - Data Factory pattern
 * @see tests/factories/README.md - Usage guide
 */

// Agent factories
export {
  createAgentContext,
  createAgentLoopOptions,
  createThreadMessage,
  createThreadHistory,
  createMockMessageStream,
  createMockStreamWithText,
  createMockStreamWithToolUse,
  createMockStreamWithChunks,
  createSlackUserId,
  createSlackChannelId,
  createSlackTimestamp,
  createTestScenario,
  // PTC factories (Story 6.3)
  createMockStreamWithPtc,
  createMockStreamWithPtcExpired,
  createMockStreamWithPtcTimeout,
} from './agent-factory.js';

// Future factories will be exported here:
// export { createSlackEvent, createAppMentionEvent, ... } from './slack-factory.js';
// export { createMcpTool, createToolResult, ... } from './tool-factory.js';
