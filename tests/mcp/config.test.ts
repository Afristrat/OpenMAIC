import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMCPServerConfigs } from '@/lib/mcp/config';

vi.mock('node:fs', () => ({ default: { existsSync: () => false } }));

afterEach(() => vi.unstubAllEnvs());

const valid = { id: 'docs', url: 'https://example.com/mcp', enabled: true };

describe('MCP configuration boundary', () => {
  it('rejects malformed values and ambiguous server IDs', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        null,
        3,
        { ...valid, enabled: 'true' },
        { ...valid, timeoutMs: -1 },
        { ...valid, url: 'file:///etc/passwd' },
        { ...valid, url: 'https://user:password@example.com/mcp' },
        { ...valid, organizationIds: ['*'] },
        valid,
        valid,
      ]),
    );
    expect(loadMCPServerConfigs()).toEqual([]);
  });

  it('loads credentials only from the environment and requires explicit tenant grants', () => {
    vi.stubEnv('MCP_DOCS_API_KEY', 'environment-fixture');
    vi.stubEnv('MCP_SERVERS', JSON.stringify([{ ...valid, apiKey: 'ignored-fixture' }]));
    expect(loadMCPServerConfigs()).toEqual([
      {
        ...valid,
        name: 'docs',
        apiKey: 'environment-fixture',
        organizationIds: [],
        transport: 'streamable-http',
        timeoutMs: 30_000,
      },
    ]);
  });
});
