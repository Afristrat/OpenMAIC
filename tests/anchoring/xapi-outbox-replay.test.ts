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
    upsert: vi.fn(),
    maybeSingle: vi.fn(),
  };
  for (const name of ['select', 'eq', 'upsert'] as const) chain[name].mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: { courses: { org_id: 'tenant' } }, error: null });
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.client.mockReturnValue({ from: () => chain });
  expect(await enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' })).toBe(true);
  expect(chain.upsert.mock.calls[0][1]).toEqual({
    onConflict: 'org_id,dedupe_key',
    ignoreDuplicates: true,
  });
  expect(mocks.enqueue).not.toHaveBeenCalled();
  chain.maybeSingle.mockResolvedValue({ data: { id: 12 }, error: null });
  expect(await enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' })).toBe(true);
  expect(mocks.enqueue).toHaveBeenCalledWith({ outboxId: 12 });
  chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'secret' } });
  await expect(
    enqueueAnchorSessionStatement({ sessionId: 'session', userId: 'user' }),
  ).rejects.toThrow('xAPI outbox insert failed');
});
