/**
 * Memory Tool Module
 *
 * Provides persistent memory storage via GCS using Anthropic's betaMemoryTool helper.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see Story 5.2 - Memory Scopes & Path Builders
 */

// Tool registration (SDK helper pattern)
export {
  getMemoryTool,
  setMemoryToolContext,
  clearMemoryToolContext,
  MEMORY_TOOL_NAME,
} from './tool.js';

// Handlers (for direct testing)
export { createMemoryHandlers } from './handlers.js';

// Storage (for direct testing)
export { readFile, writeFile, deleteFile, listFiles, copyFile, fileExists } from './storage.js';

// Formatting utilities
export { formatFileWithLineNumbers, formatDirectoryListing } from './format.js';

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

// Memory loader (Story 5.3)
export {
  loadRelevantMemories,
  formatMemoriesForContext,
  type MemoryContext,
  type LoadedMemories,
} from './loader.js';
