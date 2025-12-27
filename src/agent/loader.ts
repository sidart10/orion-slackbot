/**
 * Agent Loader
 *
 * Loads agent definitions from .orion/agents/ directory.
 * Parses markdown frontmatter for agent configuration.
 * Caches loaded agents in memory for performance.
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Agent definition parsed from markdown file.
 */
export interface AgentDefinition {
  /** Agent name from frontmatter */
  name: string;
  /** Agent description */
  description: string;
  /** System prompt content (markdown body) */
  prompt: string;
  /** Optional tools list from frontmatter */
  tools?: string[];
  /** Optional model override */
  model?: string;
}

// Cache loaded agents in memory
const agentCache = new Map<string, AgentDefinition>();

/**
 * Load agent prompt from .orion/agents/{name}.md
 *
 * Parses the markdown file, extracting frontmatter metadata
 * and returning the body as the system prompt.
 *
 * @param agentName - Name of the agent to load (without .md extension)
 * @returns System prompt string
 * @throws Error if agent file not found or unreadable
 */
export async function loadAgentPrompt(agentName: string): Promise<string> {
  const cached = agentCache.get(agentName);
  if (cached) {
    return cached.prompt;
  }

  const agentPath = join(process.cwd(), '.orion', 'agents', `${agentName}.md`);

  try {
    const content = await readFile(agentPath, 'utf-8');
    const agent = parseAgentFile(content);
    agentCache.set(agentName, agent);

    logger.info({
      event: 'agent.loaded',
      agentName,
      promptLength: agent.prompt.length,
      hasTools: !!agent.tools?.length,
    });

    return agent.prompt;
  } catch (error) {
    logger.error({
      event: 'agent.load_error',
      agentName,
      path: agentPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to load agent: ${agentName}`);
  }
}

/**
 * Parse agent markdown file.
 *
 * Supports YAML frontmatter for metadata:
 * - name: Agent name
 * - description: Agent description
 * - model: Optional model override
 * - tools: Comma-separated list of tools
 *
 * @param content - Raw markdown file content
 * @returns Parsed agent definition
 */
function parseAgentFile(content: string): AgentDefinition {
  const lines = content.split('\n');
  let inFrontmatter = false;
  const frontmatter: Record<string, string> = {};
  const promptLines: string[] = [];
  let frontmatterEnded = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter && !frontmatterEnded) {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterEnded = true;
        continue;
      }
    }

    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    } else if (frontmatterEnded || !inFrontmatter) {
      promptLines.push(line);
    }
  }

  return {
    name: frontmatter.name || 'unknown',
    description: frontmatter.description || '',
    prompt: promptLines.join('\n').trim(),
    tools: frontmatter.tools?.split(',').map((t) => t.trim()),
    model: frontmatter.model,
  };
}

/**
 * Load full agent definition with all metadata.
 *
 * @param agentName - Name of the agent to load
 * @returns Complete agent definition
 */
export async function loadAgentDefinition(
  agentName: string
): Promise<AgentDefinition> {
  const cached = agentCache.get(agentName);
  if (cached) {
    return cached;
  }

  const agentPath = join(process.cwd(), '.orion', 'agents', `${agentName}.md`);

  try {
    const content = await readFile(agentPath, 'utf-8');
    const agent = parseAgentFile(content);
    agentCache.set(agentName, agent);
    return agent;
  } catch (error) {
    logger.error({
      event: 'agent.load_error',
      agentName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to load agent: ${agentName}`);
  }
}

/**
 * Clear the agent cache.
 *
 * Useful for development when agent files are modified.
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

/**
 * Get cached agent names.
 *
 * @returns Array of cached agent names
 */
export function getCachedAgentNames(): string[] {
  return Array.from(agentCache.keys());
}

