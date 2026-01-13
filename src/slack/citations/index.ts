/**
 * Citations Module Index (Story 8.1)
 *
 * Public API for Anthropic Citations API integration and unified references.
 *
 * @see Story 8.1 - Citations & Sources Unification
 */

// Types
export type {
  DocumentCitation,
  ParsedCitation,
  DocumentMetadata,
  ToolSource,
  UnifiedReference,
  CitationEventMetadata,
} from './types.js';

// Parser functions
export {
  extractCitations,
  parseCitationsWithMetadata,
  truncateCitedText,
  deduplicateCitations,
  countCitationsByDocument,
  isCiteBlock,
  type ContentBlock,
} from './parser.js';

// Formatter functions
export {
  formatReferencesBlock,
  formatToolDisplayName,
  formatToolReference,
  formatDocumentReference,
  buildUnifiedReferences,
  contextSourceToToolSource,
  type ReferencesContextBlock,
} from './formatter.js';
