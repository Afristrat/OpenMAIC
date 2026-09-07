import { afterEach, expect, it, vi } from 'vitest';
import {
  callExternalTool,
  disconnectAll,
  getExternalTools,
  initMCPClients,
} from '@/lib/mcp/client';

const calls = vi.hoisted(() => ({ tool: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async listTools() {
      return { tools: [{ name: 'search', inputSchema: { type: 'object' } }] };
    }
    callTool = calls.tool;
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    async close() {}
  },
}));

afterEach(async () => {
  await disconnectAll();
  vi.clearAllMocks();
});

it('hides tools and refuses direct execution outside the configured tenant', async () => {
  await initMCPClients([
    {
      id: 'docs',
      name: 'Docs',
      url: 'https://example.com/mcp',
      enabled: true,
      organizationIds: ['tenant-a'],
    },
  ]);
  expect(getExternalTools()).toEqual({});
  expect(getExternalTools('tenant-b')).toEqual({});
  await expect(callExternalTool('docs', 'search', {}, 'tenant-b')).rejects.toThrow(
    'access denied',
  );
  await expect(callExternalTool('docs', 'search', {})).rejects.toThrow('access denied');
  expect(calls.tool).not.toHaveBeenCalled();
  expect(getExternalTools('tenant-a').docs__search.inputSchema).toBeDefined();
  calls.tool.mockResolvedValue({ content: [{ type: 'text', text: 'authorized result' }] });
  await expect(callExternalTool('docs', 'search', {}, 'tenant-a')).resolves.toBe(
    'authorized result',
  );
  expect(calls.tool).toHaveBeenCalledTimes(1);
});
