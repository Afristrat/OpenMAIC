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
import { createLogger } from '@/lib/logger';

import type { MCPServerConfig } from './client';

const log = createLogger('MCPConfig');

/** Shape of the YAML config file */
interface MCPConfigFile {
  servers: MCPServerConfig[];
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
    const parsed = yaml.load(content) as MCPConfigFile;

    if (!parsed?.servers || !Array.isArray(parsed.servers)) {
      log.warn('mcp-servers.yml exists but has no valid "servers" array');
      return [];
    }

    const configs = parsed.servers.map(normalizeConfig).filter((c): c is MCPServerConfig => c !== null);
    log.info(`Loaded ${configs.length} MCP server config(s) from mcp-servers.yml`);
    return configs;
  } catch (error) {
    log.error(
      `Failed to parse mcp-servers.yml: ${error instanceof Error ? error.message : String(error)}`,
    );
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

    const configs = (parsed as MCPServerConfig[]).map(normalizeConfig).filter((c): c is MCPServerConfig => c !== null);
    log.info(`Loaded ${configs.length} MCP server config(s) from MCP_SERVERS env var`);
    return configs;
  } catch (error) {
    log.error(
      `Failed to parse MCP_SERVERS env var: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Normalize and validate a server config, applying defaults.
 */
function normalizeConfig(raw: MCPServerConfig): MCPServerConfig | null {
  if (typeof raw.id !== 'string' || !raw.id) {
    log.warn('Invalid MCP server config: missing or invalid id');
    return null;
  }
  if (typeof raw.url !== 'string' || !raw.url) {
    log.warn('Invalid MCP server config: missing or invalid url');
    return null;
  }
  return {
    id: raw.id,
    name: raw.name || raw.id,
    url: raw.url,
    apiKey: raw.apiKey ?? process.env[`MCP_${raw.id.toUpperCase().replace(/-/g, '_')}_API_KEY`],
    enabled: raw.enabled ?? false,
    transport: raw.transport ?? 'streamable-http',
    timeoutMs: raw.timeoutMs ?? 30_000,
  };
}
