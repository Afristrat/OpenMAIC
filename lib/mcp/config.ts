/**
 * MCP Server Configuration Loader
 *
 * Reads MCP server configs from:
 *   1. mcp-servers.yml in the project root (primary)
 *   2. MCP_SERVERS environment variable (JSON string fallback)
 *
 * Returns MCPServerConfig[] for use with initMCPClients().
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod/v4';
import { createLogger } from '@/lib/logger';

import type { MCPServerConfig } from './client';

const log = createLogger('MCPConfig');

/** Shape of the YAML config file */
const configSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).optional(),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  }),
  enabled: z.boolean().default(false),
  organizationIds: z.array(z.uuid()).default([]),
  transport: z.enum(['sse', 'streamable-http']).default('streamable-http'),
  timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
});

function normalizeConfigs(raw: unknown[]): MCPServerConfig[] {
  const configs = raw.map(normalizeConfig).filter((value) => value !== null);
  const counts = new Map<string, number>();
  for (const config of configs) counts.set(config.id, (counts.get(config.id) ?? 0) + 1);
  // Ambiguous IDs must not select whichever tenant credentials happened to load last.
  return configs.filter((config) => counts.get(config.id) === 1);
}

/**
 * Load MCP server configurations from available sources.
 *
 * Priority:
 *   1. `mcp-servers.yml` in project root
 *   2. `MCP_SERVERS` env var (JSON-encoded MCPServerConfig[])
 *
 * Returns an empty array if no configuration is found.
 */
export function loadMCPServerConfigs(): MCPServerConfig[] {
  // Attempt 1: YAML config file
  const yamlConfigs = loadFromYaml();
  if (yamlConfigs !== null) {
    return yamlConfigs;
  }

  // Attempt 2: Environment variable
  const envConfigs = loadFromEnv();
  if (envConfigs !== null) {
    return envConfigs;
  }

  log.info('No MCP server configuration found (checked mcp-servers.yml and MCP_SERVERS env var)');
  return [];
}

/**
 * Load configs from mcp-servers.yml in the project root.
 * Returns null if the file does not exist.
 */
function loadFromYaml(): MCPServerConfig[] | null {
  const configPath = path.resolve(process.cwd(), 'mcp-servers.yml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content) as { servers?: unknown } | null;

    if (!parsed?.servers || !Array.isArray(parsed.servers)) {
      log.warn('mcp-servers.yml exists but has no valid "servers" array');
      return [];
    }

    const configs = normalizeConfigs(parsed.servers);
    log.info(`Loaded ${configs.length} MCP server config(s) from mcp-servers.yml`);
    return configs;
  } catch {
    log.error('Failed to parse mcp-servers.yml');
    return [];
  }
}

/**
 * Load configs from the MCP_SERVERS environment variable.
 * Expects a JSON-encoded array of MCPServerConfig objects.
 * Returns null if the env var is not set.
 */
function loadFromEnv(): MCPServerConfig[] | null {
  const envValue = process.env.MCP_SERVERS;

  if (!envValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(envValue) as unknown;

    if (!Array.isArray(parsed)) {
      log.warn('MCP_SERVERS env var is not a JSON array');
      return [];
    }

    const configs = normalizeConfigs(parsed);
    log.info(`Loaded ${configs.length} MCP server config(s) from MCP_SERVERS env var`);
    return configs;
  } catch {
    log.error('Failed to parse MCP_SERVERS env var');
    return [];
  }
}

/**
 * Normalize and validate a server config, applying defaults.
 */
function normalizeConfig(raw: unknown): MCPServerConfig | null {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('Invalid MCP server configuration');
    return null;
  }
  const config = parsed.data;
  return {
    ...config,
    name: config.name ?? config.id,
    apiKey: process.env[`MCP_${config.id.toUpperCase().replace(/-/g, '_')}_API_KEY`],
  };
}
