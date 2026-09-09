import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.client }));
import {
  buildOptimizationSuggestion,
  getOptimizationSuggestion,
} from '@/lib/generation/data-optimizer';
const observation = (score: number, sequence = ['slide', 'quiz']) => ({
  scene_sequence: sequence,
  quiz_scores: [score],
});

describe('data optimizer without minimum observations', () => {
  it('does not confuse missing or invalid observations with failure scores', () => {
    for (const rows of [
      null,
      {},
      [],
      [observation(NaN)],
      [observation(Infinity)],
      [observation(-1)],
      [observation(1.1)],
      [observation(0.5, [])],
      [{ scene_sequence: ['slide'], quiz_scores: [] }],
    ]) {
      expect(buildOptimizationSuggestion(rows)).toBeNull();
    }
    expect(buildOptimizationSuggestion([observation(0)])).toMatchObject({
      sampleSize: 1,
      observedMeanQuizScore: 0,
      difficultyModifier: -0.2,
    });
  });
  it('uses one usable observation and exposes limits, not fake confidence', () => {
    const result = buildOptimizationSuggestion([null, observation(0.8)]);
    expect(result).toEqual({
      recommendedSceneOrder: ['slide', 'quiz'],
      difficultyModifier: 0.1,
      sampleSize: 1,
      selectedSequenceSampleSize: 1,
      observedMeanQuizScore: 0.8,
      selectedSequenceMeanQuizScore: 0.8,
      evidence: 'observational',
      observationWindowLimit: 1000,
    });
    expect(result).not.toHaveProperty('confidence');
  });
  it('chooses observed sequence performance without a hidden sample threshold', () => {
    expect(
      buildOptimizationSuggestion([
        observation(0.8),
        observation(0.6),
        observation(0.9, ['interactive', 'quiz']),
      ]),
    ).toMatchObject({
      recommendedSceneOrder: ['interactive', 'quiz'],
      sampleSize: 3,
      selectedSequenceSampleSize: 1,
      selectedSequenceMeanQuizScore: 0.9,
    });
  });
  it('keeps sequence keys distinct and ties independent of input order', () => {
    const rows = [observation(0.8, ['a,b', 'c']), observation(0.8, ['a', 'b,c'])];
    expect(buildOptimizationSuggestion(rows)).toEqual(
      buildOptimizationSuggestion([...rows].reverse()),
    );
    expect(buildOptimizationSuggestion(rows)?.selectedSequenceSampleSize).toBe(1);
  });
  it('bounds memory and difficulty without imposing a minimum', () => {
    expect(
      buildOptimizationSuggestion(Array.from({ length: 1000 }, () => observation(1))),
    ).toMatchObject({ sampleSize: 1000, difficultyModifier: 0.2 });
    expect(
      buildOptimizationSuggestion(Array.from({ length: 1001 }, () => observation(1))),
    ).toBeNull();
  });
});

describe('authorized observation query', () => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  beforeEach(() => {
    vi.clearAllMocks();
    for (const name of ['from', 'select', 'in', 'contains', 'eq', 'order', 'limit'])
      chain[name] = vi.fn(() => chain);
    chain.abortSignal = mocks.query;
    mocks.client.mockReturnValue(chain);
    mocks.query.mockResolvedValue({ data: [observation(0.8)], error: null });
  });
  it('never queries without authorized stages', async () => {
    expect(await getOptimizationSuggestion('SIPOC', 'adult', 'fr-FR', [])).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('scopes stages and context, bounds the query, and uses one result', async () => {
    expect(await getOptimizationSuggestion(' SIPOC ', 'adult', 'fr-FR', ['stage:1'])).toMatchObject(
      { sampleSize: 1 },
    );
    expect(chain.in).toHaveBeenCalledWith('stage_id', ['stage:1']);
    expect(chain.contains).toHaveBeenCalledWith('subject_tags', ['SIPOC']);
    expect(chain.eq).toHaveBeenCalledWith('level', 'adult');
    expect(chain.eq).toHaveBeenCalledWith('language', 'fr-FR');
    expect(chain.limit).toHaveBeenCalledWith(1000);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it('falls back on database, transport and configuration errors', async () => {
    mocks.query.mockResolvedValueOnce({ data: null, error: { message: 'private detail' } });
    expect(await getOptimizationSuggestion('SIPOC', 'adult', 'fr-FR', ['stage:1'])).toBeNull();
    mocks.query.mockRejectedValueOnce(new Error('network'));
    expect(await getOptimizationSuggestion('SIPOC', 'adult', 'fr-FR', ['stage:1'])).toBeNull();
    mocks.client.mockImplementationOnce(() => {
      throw new Error('configuration');
    });
    expect(await getOptimizationSuggestion('SIPOC', 'adult', 'fr-FR', ['stage:1'])).toBeNull();
  });
});
