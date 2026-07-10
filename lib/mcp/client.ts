/**
 * MCP Client Manager — Connects to external MCP servers
 *
 * Uses @modelcontextprotocol/sdk to connect to remote MCP servers via
 * SSE or Streamable HTTP transport, list their tools, and expose them
 * as Vercel AI SDK compatible tool definitions.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { tool, jsonSchema } from 'ai';
import { createLogger } from '@/lib/logger';

import type { Tool } from 'ai';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const log = createLogger('MCPClient');

// ==================== Types ====================

export interface MCPServerConfig {
  id: string;
  name: string;
  /** SSE or Streamable HTTP endpoint URL */
  url: string;
  apiKey?: string;
  enabled: boolean;
  /**
   * Transport type to use. Defaults to 'streamable-http'.
   * Falls back to 'sse' automatically if streamable-http connection fails.
   */
  transport?: 'sse' | 'streamable-http';
  /** Connection timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
}

interface ConnectedServer {
  config: MCPServerConfig;
  client: Client;
  transport: Transport;
  tools: MCPToolDefinition[];
  status: 'connected' | 'error';
  errorMessage?: string;
}

// ==================== State ====================

const connectedServers = new Map<string, ConnectedServer>();

/** Initialization lock to prevent race conditions from concurrent initMCPClients calls. */
let initPromise: Promise<void> | null = null;

// ==================== Connection ====================

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1_000;

/**
 * Create a transport for the given server config.
 * Tries Streamable HTTP first, falls back to SSE.
 */
function createTransport(config: MCPServerConfig): Transport {
  const url = new URL(config.url);
  const headers: Record<string, string> = {};

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  if (config.transport === 'sse') {
    return new SSEClientTransport(url, {
      eventSourceInit: {
        fetch: (input: string | URL | Request, init?: RequestInit) =>
          fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), ...headers },
          }),
      },
      requestInit: { headers },
    });
  }

  // Default: Streamable HTTP
  return new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
}

/**
 * Connect to a single MCP server and list its tools.
 */
async function connectToServer(config: MCPServerConfig): Promise<ConnectedServer> {
  const client = new Client(
    { name: 'qalem-mcp-client', version: '1.0.0' },
    { capabilities: {} },
  );

  const transport = createTransport(config);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // Connect with timeout via AbortController
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      await client.connect(transport, { signal: abortController.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    // List available tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools as MCPToolDefinition[];

    log.info(
      `Connected to MCP server "${config.name}" (${config.id}): ${tools.length} tool(s) available`,
    );

    return {
      config,
      client,
      transport,
      tools,
      status: 'connected',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to connect to MCP server "${config.name}" (${config.id}): ${message}`);

    // If Streamable HTTP failed and wasn't explicitly set to SSE, retry with SSE
    if (config.transport !== 'sse') {
      log.info(`Retrying "${config.name}" with SSE transport...`);
      try {
        const sseTransport = createTransport({ ...config, transport: 'sse' });

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        const sseClient = new Client(
          { name: 'qalem-mcp-client', version: '1.0.0' },
          { capabilities: {} },
        );

        try {
          await sseClient.connect(sseTransport, { signal: abortController.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        const toolsResult = await sseClient.listTools();
        const tools = toolsResult.tools as MCPToolDefinition[];

        log.info(
          `Connected to MCP server "${config.name}" via SSE fallback: ${tools.length} tool(s)`,
        );

        return {
          config,
          client: sseClient,
          transport: sseTransport,
          tools,
          status: 'connected',
        };
      } catch (sseError) {
        const sseMessage = sseError instanceof Error ? sseError.message : String(sseError);
        log.error(`SSE fallback also failed for "${config.name}": ${sseMessage}`);
      }
    }

    return {
      config,
      client,
      transport,
      tools: [],
      status: 'error',
      errorMessage: message,
    };
  }
}

// ==================== Public API ====================

/**
 * Initialize connections to all enabled MCP servers.
 * Connects in parallel; individual failures do not block other servers.
 */
export async function initMCPClients(configs: MCPServerConfig[]): Promise<void> {
  // If already initializing, return the existing promise (idempotent)
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Disconnect any existing connections first
      await disconnectAll();

      const enabledConfigs = configs.filter((c) => c.enabled);

      if (enabledConfigs.length === 0) {
        log.info('No enabled MCP servers configured');
        return;
      }

      log.info(`Connecting to ${enabledConfigs.length} MCP server(s)...`);

      const results = await Promise.allSettled(enabledConfigs.map(connectToServer));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          connectedServers.set(result.value.config.id, result.value);
        }
        // Rejections are already logged inside connectToServer
      }

      const connected = [...connectedServers.values()].filter((s) => s.status === 'connected').length;
      log.info(`MCP initialization complete: ${connected}/${enabledConfigs.length} server(s) connected`);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Return Vercel AI SDK compatible tool definitions from all connected MCP servers.
 *
 * Tool names are prefixed with the server ID to avoid collisions:
 * `{serverId}__{toolName}`
 */
export function getExternalTools(): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [serverId, server] of connectedServers) {
    if (server.status !== 'connected') continue;

    for (const mcpTool of server.tools) {
      const qualifiedName = `${serverId}__${mcpTool.name}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP tool schemas are dynamic
      tools[qualifiedName] = {
        description: mcpTool.description ?? `Tool "${mcpTool.name}" from MCP server "${server.config.name}"`,
        parameters: jsonSchema(mcpTool.inputSchema),
        execute: async (args: Record<string, unknown>) => {
          return callExternalTool(serverId, mcpTool.name, args);
        },
      } as unknown as Tool; // MCP tool schemas are dynamic, cannot satisfy static Tool type
    }
  }

  return tools;
}

/**
 * Call a tool on a specific connected MCP server.
 */
export async function callExternalTool(
  serverId: string,
  toolName: string,
  args: unknown,
): Promise<unknown> {
  const server = connectedServers.get(serverId);

  if (!server) {
    throw new Error(`MCP server "${serverId}" not found`);
  }

  if (server.status !== 'connected') {
    throw new Error(`MCP server "${serverId}" is not connected (status: ${server.status})`);
  }

  log.info(`Calling tool "${toolName}" on server "${server.config.name}"`);

  try {
    const result = await server.client.callTool({
      name: toolName,
      arguments: args as Record<string, unknown>,
    });

    // Extract text content from MCP result for simpler downstream consumption
    if ('content' in result && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text);

      if (textParts.length === 1) return textParts[0];
      if (textParts.length > 1) return textParts.join('\n');

      // Return the raw content array for non-text results (images, resources, etc.)
      return result.content;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool call failed: "${toolName}" on "${serverId}": ${message}`);

    // Attempt reconnection on transport errors
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed') || message.includes('aborted')) {
      await attemptReconnect(serverId);
    }

    throw new Error(`MCP tool call failed (${serverId}/${toolName}): ${message}`);
  }
}

/**
 * Get status of all configured servers.
 */
export function getConnectedServers(): {
  id: string;
  name: string;
  status: 'connected' | 'error';
  toolCount: number;
  errorMessage?: string;
}[] {
  return [...connectedServers.values()].map((s) => ({
    id: s.config.id,
    name: s.config.name,
    status: s.status,
    toolCount: s.tools.length,
    errorMessage: s.errorMessage,
  }));
}

/**
 * Attempt to reconnect to a server that has errored.
 * Uses exponential backoff with a maximum number of attempts.
 */
async function attemptReconnect(serverId: string): Promise<void> {
  const server = connectedServers.get(serverId);
  if (!server) return;

  log.info(`Attempting reconnection to "${server.config.name}"...`);

  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Close existing transport gracefully
      try {
        await server.transport.close();
      } catch {
        // Ignore close errors
      }

      const reconnected = await connectToServer(server.config);
      connectedServers.set(serverId, reconnected);

      if (reconnected.status === 'connected') {
        log.info(`Reconnected to "${server.config.name}" on attempt ${attempt}`);
        return;
      }
    } catch (error) {
      log.warn(
        `Reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} failed for "${server.config.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  log.error(
    `Failed to reconnect to "${server.config.name}" after ${MAX_RECONNECT_ATTEMPTS} attempts`,
  );
}

/**
 * Disconnect from all MCP servers and clear state.
 */
export async function disconnectAll(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [, server] of connectedServers) {
    closePromises.push(
      (async () => {
        try {
          await server.transport.close();
        } catch (error) {
          log.warn(
            `Error closing transport for "${server.config.name}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })(),
    );
  }

  await Promise.allSettled(closePromises);
  connectedServers.clear();
  log.info('All MCP connections closed');
}

/**
 * Disconnect from a single MCP server by ID.
 */
export async function disconnectServer(serverId: string): Promise<void> {
  const server = connectedServers.get(serverId);
  if (!server) return;

  try {
    await server.transport.close();
  } catch (error) {
    log.warn(
      `Error closing transport for "${server.config.name}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  connectedServers.delete(serverId);
  log.info(`Disconnected from MCP server "${server.config.name}"`);
}
