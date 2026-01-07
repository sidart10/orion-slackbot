/**
 * Skills Module
 *
 * Provides skill loading, parsing, system prompt integration,
 * and Anthropic Skills API integration.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 */

// Types
export type {
  Skill,
  SkillMetadata,
  SkillTool,
  SkillToolParameter,
  SkillScript,
  SkillLoadResult,
  SkillMetadataLoadResult,
  // Story 6.2 types
  ApiSkill,
  ApiSkillVersion,
  SkillFile,
  SkillCache,
  ContainerParameter,
  SkillGeneratedFile,
  SkillExecutionFiles,
  // Story 6.3 types
  ContainerState,
  ContainerLifecycleConfig,
  // Story 6.4 types
  SkillType,
  ContainerSkillReference,
  SkillRegistryEntry,
} from './types.js';
export { TOOL_NAME_PATTERN } from './types.js';

// Loader
export {
  loadSkills,
  loadSkillsWithResult,
  getSkills,
  reloadSkills,
  // Metadata-only loading (progressive disclosure)
  loadSkillMetadata,
  loadSkillMetadataWithResult,
  getSkillMetadata,
  reloadSkillMetadata,
  // On-demand instruction loading
  loadSkillInstructions,
} from './loader.js';

// Parser
export { parseSkillMd, parseSkillFrontmatterOnly } from './parser.js';

// Prompt Builder
export { buildSkillsPrompt, buildSkillsHint } from './prompt-builder.js';

// Tool Handler
export { executeSkillTool, parseSkillToolName, registerSkillTools } from './tool-handler.js';
// Note: executeSkillTool returns the canonical ToolResult type (see src/utils/tool-result.ts)

// =============================================================================
// Story 6.2 - Skills API Client for Anthropic Container Integration
// =============================================================================

// API Client - wraps Anthropic SDK beta Skills API
export { SkillsApiClient } from './api-client.js';

// Sync Service - syncs local skills to Anthropic API
export {
  syncSkills,
  hashSkillDirectory,
  loadSkillFiles,
  getCachedSkillIds,
  type SyncResult,
} from './sync-service.js';

// Container Builder - builds container param for Messages API
export {
  buildContainerParameter,
  extractSkillIds,
  type SkillEntry,
} from './container-builder.js';

// Initialization - startup skill sync
export {
  initializeSkills,
  isSkillsInitialized,
  getLastSyncResult,
} from './init.js';

// =============================================================================
// Story 6.3 - Container Lifecycle Manager
// =============================================================================

// Container Lifecycle - manages container ID persistence across turns
export { containerLifecycle } from './container-lifecycle.js';

// =============================================================================
// Story 6.4 - Skill Registry Service
// =============================================================================

// Skill Registry - centralized skill ID and metadata lookup with built-in skill support
export { skillRegistry } from './registry.js';

