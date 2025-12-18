/**
 * Agent Loader Module
 *
 * Loads agent definitions from .orion/agents/ directory.
 * Parses markdown frontmatter for configuration and caches loaded agents.
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Parsed agent definition from markdown file
 */
export interface AgentDefinition {
  /** Agent name from frontmatter */
  name: string;
  /** Agent description from frontmatter */
  description: string;
  /** System prompt content (markdown body) */
  prompt: string;
  /** Allowed tools from frontmatter */
  tools?: string[];
  /** Preferred model from frontmatter */
  model?: string;
}

/** Cache for loaded agent definitions */
const agentCache = new Map<string, AgentDefinition>();

/**
 * Load agent prompt from .orion/agents/{name}.md
 *
 * @param agentName - Name of the agent to load (e.g., 'orion')
 * @returns The system prompt content
 * @throws Error if agent file cannot be read
 *
 * @example
 * const prompt = await loadAgentPrompt('orion');
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
      event: 'agent_loaded',
      agentName,
      promptLength: agent.prompt.length,
    });

    return agent.prompt;
  } catch (error) {
    logger.error({
      event: 'agent_load_error',
      agentName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to load agent: ${agentName}`);
  }
}

/**
 * Parse agent markdown file with frontmatter
 *
 * Expected format:
 * ```
 * ---
 * name: orion
 * description: AI assistant
 * model: claude-sonnet-4-20250514
 * tools: Read,Write,Bash
 * ---
 *
 * # Orion
 *
 * You are Orion...
 * ```
 *
 * @param content - Raw markdown content
 * @returns Parsed agent definition
 */
export function parseAgentFile(content: string): AgentDefinition {
  const lines = content.split('\n');
  let inFrontmatter = false;
  const frontmatter: Record<string, string> = {};
  const promptLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter && Object.keys(frontmatter).length === 0) {
        inFrontmatter = true;
        continue;
      }
      inFrontmatter = false;
      continue;
    }

    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    } else {
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
 * Load all agents from .orion/agents/ directory
 *
 * @returns Record of agents keyed by name
 */
export async function loadOrionAgents(): Promise<Record<string, AgentDefinition>> {
  // Implementation for bulk loading (used for subagents in future stories)
  // Returns agents keyed by name for Claude SDK agents option
  return {};
}

/**
 * Clear agent cache
 * Useful for development and testing
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

