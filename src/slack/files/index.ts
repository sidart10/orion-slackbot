/**
 * Slack Files Module
 *
 * Public exports for Slack file operations.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 */

export * from './types.js';
export { downloadSlackFile, SlackFileDownloadError } from './download.js';
