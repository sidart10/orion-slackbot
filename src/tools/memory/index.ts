/**
 * Memory Tool Module
 *
 * Provides persistent memory storage via GCS using Anthropic's Memory Tool pattern.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see Story 5.2 - Memory Scopes & Path Builders
 */

// Tool registration
export {
  registerMemoryTool,
  setMemoryToolContext,
  clearMemoryToolContext,
  MEMORY_TOOL_NAME,
} from './tool.js';

// Handler (for direct testing)
export {
  handleMemoryTool,
  type MemoryToolInput,
  type MemoryData,
  type MemoryToolContext,
} from './handler.js';

// Storage (for direct testing)
export { readFile, writeFile, deleteFile, listFiles } from './storage.js';

// Path builders and validation (Story 5.2)
export {
  Memory,
  getPath,
  validateMemoryPath,
  MAX_MEMORY_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  type MemoryPath,
  type AllowedExtension,
  type PathValidation,
} from './paths.js';

