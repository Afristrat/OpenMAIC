import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.client }));
import {
  aggregateDiscussionPatterns,
  getBestPatterns,
  shouldUseDataDriven,
  suggestNextAgent,
} from '@/lib/orchestration/data-driven-director';
const row = (score: number, next = 'curious') => ({
  agent_sequence: ['teacher', next],
  intervention_types: ['explanation', 'question'],
  post_discussion_quiz_score: score,
});

it('returns no pattern for absent, invalid or unscored observations', () => {
  for (const rows of [
    null,
    [],
    [row(NaN)],
    [row(Infinity)],
    [row(-1)],
    [row(2)],
    [{ ...row(0.5), intervention_types: [] }],
  ])
    expect(aggregateDiscussionPatterns(rows)).toEqual([]);
  expect(suggestNextAgent([], [], ['teacher'])).toBeNull();
});
it('uses one observation, including a valid zero, and exposes its limits', () => {
  const patterns = aggregateDiscussionPatterns([row(0)]);
  expect(suggestNextAgent(['teacher'], patterns, ['curious'])).toEqual({
    agentId: 'curious',
    sampleSize: 1,
    observedMeanQuizScore: 0,
    evidence: 'observational',
  });
});
it('aggregates counts but does not merge different intervention sequences', () => {
  const patterns = aggregateDiscussionPatterns([
    row(0.6),
    row(0.8),
    { ...row(1), intervention_types: ['question', 'example'] },
  ]);
  expect(patterns).toHaveLength(2);
  expect(patterns[1]).toMatchObject({ sampleSize: 2, avgQuizScore: 0.7 });
});
it('chooses the best available next agent even when patterns are unsorted', () => {
  const patterns = aggregateDiscussionPatterns([row(0.2), row(0.9, 'thinker')]).reverse();
  expect(suggestNextAgent(['teacher'], patterns, ['curious', 'thinker'])?.agentId).toBe('thinker');
  expect(suggestNextAgent(['teacher'], patterns, ['curious'])?.agentId).toBe('curious');
  expect(suggestNextAgent(['unknown'], patterns, ['curious'])).toBeNull();
  expect(suggestNextAgent(['teacher', 'curious'], patterns, ['curious'])).toBeNull();
});
it('rejects empty samples and non-finite scores at the suggestion boundary', () => {
  const p = aggregateDiscussionPatterns([row(0.5)])[0];
  for (const invalid of [
    { ...p, sampleSize: 0 },
    { ...p, sampleSize: NaN },
    { ...p, avgQuizScore: Infinity },
  ])
    expect(suggestNextAgent(['teacher'], [invalid], ['curious'])).toBeNull();
});
it('keeps ties stable without changing the input', () => {
  const patterns = aggregateDiscussionPatterns([row(0.5), row(0.5, 'thinker')]);
  expect(suggestNextAgent(['teacher'], patterns, ['curious', 'thinker'])).toEqual(
    suggestNextAgent(['teacher'], [...patterns].reverse(), ['curious', 'thinker']),
  );
});
it('assigns stable cohorts and keeps invalid sessions on the classic director', () => {
  const variants = Array.from({ length: 1000 }, (_, i) => shouldUseDataDriven(`session-${i}`));
  expect(variants).toEqual(
    Array.from({ length: 1000 }, (_, i) => shouldUseDataDriven(`session-${i}`)),
  );
  expect(variants.filter(Boolean).length).toBeGreaterThan(400);
  expect(variants.filter(Boolean).length).toBeLessThan(600);
  expect(shouldUseDataDriven('')).toBe(false);
});

const chain: Record<string, ReturnType<typeof vi.fn>> = {};
const scope = {
  actorId: '00000000-0047-4000-8000-000000000021',
  orgId: '00000000-0047-4000-8000-000000000022',
  stageIds: ['stage:1'],
};
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['rpc']) chain[name] = vi.fn(() => chain);
  chain.abortSignal = mocks.query;
  mocks.client.mockReturnValue(chain);
  mocks.query.mockResolvedValue({ data: [row(0.5)], error: null });
});
it('does not read observations without an authorized scope', async () => {
  expect(await getBestPatterns('SIPOC', 'fr-FR', { ...scope, stageIds: [] })).toEqual([]);
  expect(await getBestPatterns('SIPOC', 'fr-FR', { ...scope, actorId: 'forged' })).toEqual([]);
  expect(mocks.client).not.toHaveBeenCalled();
});
it('scopes and bounds the query without a sample minimum', async () => {
  expect(await getBestPatterns('SIPOC', 'fr-FR', scope)).toHaveLength(1);
  expect(chain.rpc).toHaveBeenCalledWith('read_authorized_discussion_patterns', {
    p_actor: scope.actorId,
    p_org: scope.orgId,
    p_stages: ['stage:1'],
    p_subject: 'SIPOC',
    p_language: 'fr-FR',
  });
  expect(mocks.query).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it('falls back when querying fails', async () => {
  mocks.query.mockRejectedValueOnce(new Error('network'));
  expect(await getBestPatterns('SIPOC', 'fr-FR', scope)).toEqual([]);
  mocks.query.mockResolvedValueOnce({ data: null, error: { message: 'private' } });
  expect(await getBestPatterns('SIPOC', 'fr-FR', scope)).toEqual([]);
});
