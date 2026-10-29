import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scene } from '@/lib/types/stage';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/lib/server/metered-media-providers', () => ({
  generateMeteredImage: vi.fn(),
  generateMeteredVideo: vi.fn(),
}));
vi.mock('@/lib/audio/tts-providers', () => ({ generateTTS: mocks.generateTTS }));
vi.mock('@/lib/server/provider-config', () => ({
  getServerImageProviders: vi.fn(() => ({})),
  getServerImageDefaultProviderId: vi.fn(() => undefined),
  getServerVideoProviders: vi.fn(() => ({})),
  getServerTTSProviders: vi.fn(() => ({ 'higgs-tts': { disabled: false } })),
  resolveImageApiKey: vi.fn(),
  resolveImageBaseUrl: vi.fn(),
  resolveVideoApiKey: vi.fn(),
  resolveVideoBaseUrl: vi.fn(),
  resolveTTSApiKey: vi.fn(() => 'test-key'),
  resolveTTSBaseUrl: vi.fn(() => 'http://tts.test'),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ upload: mocks.upload })) },
  })),
}));

import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { HIGGS_FALLBACK_VOICES_BY_GENDER } from '@/lib/audio/qualified-voice-catalog';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';

const refused = () =>
  Object.assign(new Error('Higgs TTS API error: Internal Server Error'), { status: 500 });
const agent = (id: string, voiceId: string) => ({
  id,
  voiceConfig: { providerId: 'higgs-tts', voiceId },
});
const scene = (agentIds: string[]): Scene =>
  ({
    order: 1,
    actions: agentIds.map((agentId, i) => ({
      id: `l${i}`,
      type: 'speech',
      agentId,
      text: `Phrase ${i}.`,
    })),
  }) as unknown as Scene;
const access = () => vi.fn().mockResolvedValue(undefined);
const voicesCalled = () =>
  mocks.generateTTS.mock.calls.map((c) => (c[0] as { voice: string }).voice);
/** Server that refuses the given voices with a 500 and speaks the others. */
const serverRefusing = (...broken: string[]) =>
  mocks.generateTTS.mockImplementation(async (config: { voice: string }) => {
    if (broken.includes(config.voice)) throw refused();
    return { audio: Buffer.from('wav'), format: 'wav' };
  });

describe('voice fallback when the server refuses a voice', () => {
  beforeEach(() => {
    mocks.upload.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    mocks.generateTTS.mockReset();
    vi.useRealTimers();
  });

  const run = async (scenes: Scene[], agents: ReturnType<typeof agent>[]) => {
    vi.useFakeTimers();
    // Second pass on: the lines left silent before the voice reached the breaker are retried.
    const pending = generateTTSForClassroom(
      scenes,
      'classroom-1',
      access(),
      undefined,
      agents,
      undefined,
      undefined,
      { secondPass: true },
    );
    await vi.runAllTimersAsync();
    return pending;
  };

  test('declares fallback voices per gender in one place', () => {
    expect(HIGGS_FALLBACK_VOICES_BY_GENDER.male).toEqual(['younes', 'mehdi', 'tariq', 'amine']);
    expect(HIGGS_FALLBACK_VOICES_BY_GENDER.female).toEqual(['salma', 'rim', 'hanae']);
  });

  test('a refused female voice is replaced by a female fallback voice, audioId unchanged', async () => {
    serverRefusing('layla');
    const s = scene(['a', 'a']);
    const report = await run([s], [agent('a', 'layla')]);
    expect(report).toMatchObject({ requested: 2, generated: 2 });
    expect(report.voiceSubstitutions).toEqual([
      { requestedVoice: 'layla', fallbackVoice: 'salma', agentId: 'a', lines: 2 },
    ]);
    const ids = (s.actions ?? []).map((a) => (a as { audioId?: string }).audioId);
    expect(ids).toEqual(['tts_s1_l0', 'tts_s1_l1']);
    expect(voicesCalled().at(-1)).toBe('salma');
  });

  test('a refused male voice gets a male fallback voice', async () => {
    serverRefusing('khalid');
    const report = await run([scene(['a', 'a'])], [agent('a', 'khalid')]);
    expect(report.voiceSubstitutions?.[0]).toMatchObject({
      requestedVoice: 'khalid',
      fallbackVoice: 'younes',
    });
  });

  test('skips a fallback voice that is itself refused', async () => {
    serverRefusing('khalid', 'younes');
    const report = await run([scene(['a', 'a', 'a', 'a'])], [agent('a', 'khalid')]);
    expect(report.generated).toBe(4);
    const used = (report.voiceSubstitutions ?? []).map((item) => item.fallbackVoice);
    expect(used).toContain('mehdi');
    expect(voicesCalled().filter((v) => v === 'mehdi').length).toBeGreaterThan(0);
  });

  test('a single exhausted line is not enough to replace a voice (server hiccup)', async () => {
    mocks.generateTTS.mockRejectedValueOnce(refused());
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) mocks.generateTTS.mockRejectedValueOnce(refused());
    mocks.generateTTS.mockResolvedValue({ audio: Buffer.from('wav'), format: 'wav' });
    const pending = generateTTSForClassroom([scene(['a'])], 'classroom-1', access(), undefined, [
      agent('a', 'layla'),
    ]);
    await vi.runAllTimersAsync();
    const report = await pending;
    expect(report).toEqual({ requested: 1, generated: 0 });
    expect(new Set(voicesCalled())).toEqual(new Set(['layla']));
  });

  test('a healthy voice is never replaced and the report carries no substitution', async () => {
    serverRefusing('layla');
    const report = await run([scene(['a', 'a'])], [agent('a', 'rim')]);
    expect(report).toEqual({ requested: 2, generated: 2 });
    expect(new Set(voicesCalled())).toEqual(new Set(['rim']));
  });

  test('once the voice is left alone, following lines go straight to the fallback voice', async () => {
    serverRefusing('layla');
    const report = await run([scene(['a', 'a', 'a', 'a'])], [agent('a', 'layla')]);
    expect(report).toMatchObject({ requested: 4, generated: 4 });
    expect(report.voiceSubstitutions).toEqual([
      { requestedVoice: 'layla', fallbackVoice: 'salma', agentId: 'a', lines: 4 },
    ]);
    // two full retry cycles on the refused voice, then no more attempts on it
    expect(voicesCalled().filter((v) => v === 'layla')).toHaveLength(12);
  });

  test('a permanent 4xx error is not rescued by a fallback voice', async () => {
    mocks.generateTTS.mockRejectedValue(
      Object.assign(new Error('Higgs TTS API error: Bad Request'), { status: 400 }),
    );
    const report = await run([scene(['a'])], [agent('a', 'layla')]);
    expect(report).toEqual({ requested: 1, generated: 0 });
    expect(voicesCalled()).toEqual(['layla']);
  });

  test('a credits refusal is not rescued by a fallback voice', async () => {
    mocks.generateTTS.mockRejectedValue(new InsufficientCreditsError('crédits épuisés'));
    const report = await run([scene(['a'])], [agent('a', 'layla')]);
    expect(report).toMatchObject({ requested: 1, generated: 0, creditsBlocked: true });
    expect(voicesCalled()).toEqual(['layla']);
  });

  test('behaviour is unchanged when the voice has no known gender', async () => {
    serverRefusing('mystery');
    const report = await run([scene(['a', 'a', 'a'])], [agent('a', 'mystery')]);
    expect(report).toEqual({ requested: 3, generated: 0 });
    expect(report.voiceSubstitutions).toBeUndefined();
  });

  test('behaviour is unchanged when every fallback voice of the gender is refused', async () => {
    serverRefusing('layla', 'salma', 'rim', 'hanae');
    const report = await run([scene(['a', 'a', 'a'])], [agent('a', 'layla')]);
    expect(report).toEqual({ requested: 3, generated: 0 });
    expect(report.voiceSubstitutions).toBeUndefined();
  });
});
