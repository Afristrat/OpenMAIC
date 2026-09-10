import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  flag: vi.fn(),
  config: vi.fn(),
  client: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: mocks.flag }));
vi.mock('@/lib/server/org-lrs-config', () => ({ readOrganizationLrsConfig: mocks.config }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.client }));
vi.mock('@/lib/jobs/queue', () => ({ enqueueXapiDelivery: mocks.enqueue }));
import { enqueueAnchorSessionStatement } from '@/lib/anchoring/xapi-outbox';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('preserves the first durable event on duplicate and lets recovery own its delivery', async () => {
  vi.stubEnv('XAPI_PSEUDONYM_KEY', 'synthetic-'.repeat(8));
  mocks.flag.mockResolvedValue(true);
  mocks.config.mockResolvedValue({
    enabled: true,
    endpoint: 'https://lrs.example',
    auth: 'synthetic',
  });
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
    abortSignal: vi.fn(),
  };
  for (const name of ['select', 'eq', 'rpc'] as const) chain[name].mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: { courses: { org_id: 'tenant' } }, error: null });
  chain.abortSignal.mockResolvedValue({ data: 0, error: null });
  mocks.client.mockReturnValue({ from: () => chain, rpc: chain.rpc });
  expect(await enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' })).toBe(true);
  expect(chain.rpc).toHaveBeenCalledWith(
    'enqueue_consented_anchor_xapi',
    expect.objectContaining({
      p_actor: 'user',
      p_session: 'session',
      p_org: 'tenant',
      p_key: 'anchor-session:session',
    }),
  );
  expect(mocks.enqueue).not.toHaveBeenCalled();
  chain.abortSignal.mockResolvedValue({ data: 12, error: null });
  expect(await enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' })).toBe(true);
  expect(mocks.enqueue).toHaveBeenCalledWith({ outboxId: 12 });
  chain.abortSignal.mockResolvedValue({ data: null, error: null });
  expect(await enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' })).toBe(false);
  chain.abortSignal.mockResolvedValue({ data: null, error: { message: 'secret' } });
  await expect(
    enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' }),
  ).rejects.toThrow('xAPI outbox insert failed');
});
