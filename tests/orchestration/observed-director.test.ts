import { beforeEach, expect, it, vi } from 'vitest';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
const mocks = vi.hoisted(() => ({ query: vi.fn(), patterns: vi.fn(), treatment: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      abortSignal: mocks.query,
    };
    return { from: () => chain };
  },
}));
vi.mock('@/lib/orchestration/data-driven-director', async (original) => ({
  ...(await original<typeof import('@/lib/orchestration/data-driven-director')>()),
  getBestPatterns: mocks.patterns,
  shouldUseDataDriven: mocks.treatment,
}));
import { observeDirectorChoice } from '@/lib/orchestration/observed-director';
const actor = '00000000-0048-4000-8000-000000000001';
const org = '00000000-0048-4000-8000-000000000002';
const run = () =>
  runWithUsageMeteringContext(new Headers(), actor, org, () =>
    observeDirectorChoice('stage', ['teacher'], ['peer']),
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('QALEM_DATA_DIRECTOR_ENABLED', 'true');
  mocks.treatment.mockReturnValue(true);
  mocks.query.mockResolvedValue({
    data: [{ language: 'ar-MA', outline: { analyticsContext: { subjectTags: ['SIPOC'] } } }],
    error: null,
  });
  mocks.patterns.mockResolvedValue([
    {
      agentSequence: ['teacher', 'peer'],
      interventionTypes: ['question', 'answer'],
      avgQuizScore: 0,
      sampleSize: 1,
    },
  ]);
});
it('needs a server actor and explicit activation; control does not query observations', async () => {
  expect(await observeDirectorChoice('stage', [], ['peer'])).toBeNull();
  vi.stubEnv('QALEM_DATA_DIRECTOR_ENABLED', 'false');
  expect(await run()).toBeNull();
  vi.stubEnv('QALEM_DATA_DIRECTOR_ENABLED', 'true');
  mocks.treatment.mockReturnValue(false);
  expect(await run()).toEqual({ cohort: 'classic', suggestion: null, reason: 'control' });
  expect(mocks.query).not.toHaveBeenCalled();
});
it('uses persisted context and one zero-score observation with stable server cohort identity', async () => {
  expect(await run()).toMatchObject({
    cohort: 'data-driven',
    suggestion: { agentId: 'peer', sampleSize: 1, observedMeanQuizScore: 0 },
  });
  expect(mocks.patterns).toHaveBeenCalledWith('SIPOC', 'ar-MA', {
    actorId: actor,
    orgId: org,
    stageIds: ['stage'],
  });
  expect(mocks.treatment).toHaveBeenCalledWith(JSON.stringify([actor, org, 'stage']));
});
it('falls back on absent/incompatible evidence, ambiguous content, network failure or abort', async () => {
  mocks.patterns.mockResolvedValueOnce([]);
  expect((await run())?.reason).toBe('no-compatible-pattern');
  mocks.patterns.mockResolvedValueOnce([
    {
      agentSequence: ['other', 'peer'],
      interventionTypes: ['question', 'answer'],
      avgQuizScore: 1,
      sampleSize: 1,
    },
  ]);
  expect((await run())?.suggestion).toBeNull();
  mocks.query.mockResolvedValueOnce({ data: [], error: null });
  expect((await run())?.reason).toBe('unavailable-context');
  mocks.query.mockRejectedValueOnce(new Error('private details'));
  expect((await run())?.reason).toBe('unavailable-context');
  expect(await observeDirectorChoice('stage', [], [], AbortSignal.abort())).toBeNull();
});
