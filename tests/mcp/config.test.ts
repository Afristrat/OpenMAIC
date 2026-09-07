import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMCPServerConfigs } from '@/lib/mcp/config';

const files = vi.hoisted(() => ({ yaml: undefined as string | undefined }));
vi.mock('node:fs', () => ({
  default: {
    existsSync: () => files.yaml !== undefined,
    readFileSync: () => files.yaml,
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  files.yaml = undefined;
});

const valid = { id: 'docs', url: 'https://example.com/mcp', enabled: true };

describe('MCP configuration boundary', () => {
  it('parses YAML with tenant grants and gives the file precedence over JSON', () => {
    const tenant = '00000000-0000-4000-8000-000000000001';
    files.yaml = `servers:\n  - id: docs\n    url: https://example.com/mcp\n    enabled: true\n    organizationIds: [${tenant}]\n    timeoutMs: 500\n`;
    vi.stubEnv('MCP_SERVERS', '[]');
    expect(loadMCPServerConfigs()).toEqual([
      expect.objectContaining({ id: 'docs', organizationIds: [tenant], timeoutMs: 500 }),
    ]);
    files.yaml = 'servers: [invalid';
    vi.stubEnv('MCP_SERVERS', JSON.stringify([valid]));
    expect(loadMCPServerConfigs()).toEqual([]);
  });

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
