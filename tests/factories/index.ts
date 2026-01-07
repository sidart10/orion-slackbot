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

// Skills factories (Story 6.2)
export {
  createApiSkill,
  createApiSkills,
  createApiSkillVersion,
  createSkillCacheEntry,
  createSkillCache,
  createContainerParameter,
  createSkillFiles,
  createSkillFilesWithScripts,
  createSkillGeneratedFile,
  createSyncResult,
  createMockStreamWithContainer,
  createMockStreamWithPauseTurn,
  createMockCodeExecutionResultWithFiles,
  createSkillId,
  createSkillName,
  createEpochVersion,
  createContainerId,
} from './skills-factory.js';

// Container lifecycle factories (Story 6.3)
export {
  createContainerState,
  createThreadTs,
  createThreadTsArray,
} from './container-factory.js';

// Files API factories (Story 6.5)
export {
  createFileMetadata,
  createFileMetadataArray,
  createFileId,
  createFilename,
  createExtractedFile,
  createBetaMessageWithFiles,
  createBetaMessageWithoutFiles,
  createApiError,
  MAX_FILE_SIZE_BYTES,
  ONE_MB,
  FIFTY_MB,
  OVER_LIMIT_SIZE,
} from './files-factory.js';
export type { FileMetadata, ExtractedFile, FilesApiErrorCode, BetaMessageMock } from './files-factory.js';

// Future factories will be exported here:
// export { createSlackEvent, createAppMentionEvent, ... } from './slack-factory.js';
// export { createMcpTool, createToolResult, ... } from './tool-factory.js';
