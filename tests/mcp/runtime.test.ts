import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  tools: vi.fn((tenant: string) => ({ [tenant]: {} })),
  config: vi.fn(() => []),
}));
vi.mock('@/lib/mcp/client', () => ({
  initMCPClients: mocks.init,
  getExternalTools: mocks.tools,
}));
vi.mock('@/lib/mcp/config', () => ({ loadMCPServerConfigs: mocks.config }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it('initializes once while preserving concurrent request tenants and denying unscoped calls', async () => {
  const { getRequestMCPTools } = await import('@/lib/mcp/runtime');
  const { runWithUsageMeteringContext } = await import('@/lib/billing/usage-context');
  expect(await getRequestMCPTools()).toEqual({});
  expect(mocks.init).not.toHaveBeenCalled();

  const results = await Promise.all(
    ['tenant-a', 'tenant-b'].map((tenant) =>
      runWithUsageMeteringContext(new Headers(), 'actor', tenant, async () => {
        await Promise.resolve();
        return getRequestMCPTools();
      }),
    ),
  );
  expect(results).toEqual([{ 'tenant-a': {} }, { 'tenant-b': {} }]);
  expect(mocks.init).toHaveBeenCalledTimes(1);
  expect(mocks.config).toHaveBeenCalledTimes(1);
  expect(await getRequestMCPTools()).toEqual({});
});

it('allows initialization to retry after a failure without granting unscoped access', async () => {
  const { getRequestMCPTools } = await import('@/lib/mcp/runtime');
  const { runWithUsageMeteringContext } = await import('@/lib/billing/usage-context');
  mocks.init.mockRejectedValueOnce(new Error('connection failed'));
  const request = () =>
    runWithUsageMeteringContext(new Headers(), 'actor', 'tenant-a', getRequestMCPTools);
  await expect(request()).rejects.toThrow('connection failed');
  await expect(request()).resolves.toEqual({ 'tenant-a': {} });
  expect(mocks.init).toHaveBeenCalledTimes(2);
});
