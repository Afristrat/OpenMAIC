import { beforeEach, expect, it, vi } from 'vitest';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), finish: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
import {
  beginDirectorReceipt,
  selectDirectorReceipt,
  finishDirectorReceipt,
} from '@/lib/orchestration/director-receipts';
const actor = '00000000-0048-4000-8000-000000000031';
const org = '00000000-0048-4000-8000-000000000032';
const run = <T>(fn: () => Promise<T>) => runWithUsageMeteringContext(new Headers(), actor, org, fn);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('QALEM_DATA_DIRECTOR_ENABLED', 'true');
  mocks.rpc.mockImplementation((_name, args) => ({
    abortSignal: () => Promise.resolve({ data: args.p_id, error: null }),
  }));
});
it('uses only the server actor and tenant and requires a confirmed receipt', async () => {
  expect(await beginDirectorReceipt('s048-receipt-proof', 's048-receipt-scene', 'a')).toBeNull();
  const id = await run(() => beginDirectorReceipt('s048-receipt-proof', 's048-receipt-scene', 'a'));
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect(mocks.rpc).toHaveBeenCalledWith(
    'begin_director_receipt',
    expect.objectContaining({ p_actor: actor, p_org: org, p_id: id }),
  );
  mocks.rpc.mockReturnValueOnce({ abortSignal: async () => ({ data: null, error: null }) });
  expect(
    await run(() => beginDirectorReceipt('s048-receipt-proof', 's048-receipt-scene', 'a')),
  ).toBeNull();
  vi.stubEnv('QALEM_DATA_DIRECTOR_ENABLED', 'false');
  mocks.rpc.mockClear();
  expect(
    await run(() => beginDirectorReceipt('s048-receipt-proof', 's048-receipt-scene', 'a')),
  ).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('records the selected agent and a zero score without equating selection with generation', async () => {
  const id = '00000000-0048-4000-8000-000000000033';
  await run(() =>
    selectDirectorReceipt(
      id,
      'a',
      {
        cohort: 'data-driven',
        reason: 'observed-pattern',
        suggestion: {
          agentId: 'a',
          sampleSize: 1,
          observedMeanQuizScore: 0,
          evidence: 'observational',
        },
      },
      12.2,
    ),
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    'select_director_receipt',
    expect.objectContaining({ p_sample: 1, p_score: 0, p_selected: 'a', p_lookup_ms: 12 }),
  );
  expect(mocks.rpc).not.toHaveBeenCalledWith('finish_director_receipt', expect.anything());
  await run(() => finishDirectorReceipt(id, 'failed'));
  expect(mocks.rpc).toHaveBeenCalledWith('finish_director_receipt', {
    p_actor: actor,
    p_id: id,
    p_outcome: 'failed',
  });
});
it('does not invent a receipt or fail the classroom when collection fails', async () => {
  mocks.rpc.mockReturnValue({
    abortSignal: async () => {
      throw new Error('network');
    },
  });
  expect(await run(() => beginDirectorReceipt('stage', 'scene', 'a'))).toBeNull();
  await expect(
    run(() => finishDirectorReceipt('00000000-0048-4000-8000-000000000033', 'aborted')),
  ).resolves.toBeUndefined();
});
