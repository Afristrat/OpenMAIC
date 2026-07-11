import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHyperframesBrief, localeToHyperframesLanguage } from '@/lib/video/hyperframes-brief';

describe('localeToHyperframesLanguage', () => {
  it('maps Qalem locales to short Mishkāt language codes', () => {
    expect(localeToHyperframesLanguage('fr-FR')).toBe('fr');
    expect(localeToHyperframesLanguage('ar-MA')).toBe('ar');
    expect(localeToHyperframesLanguage('en-US')).toBe('en');
  });
});

describe('buildHyperframesBrief', () => {
  const originalBrandId = process.env.MISHKAT_BRAND_ID;

  beforeEach(() => {
    process.env.MISHKAT_BRAND_ID = 'qalem-test-brand';
  });

  afterEach(() => {
    process.env.MISHKAT_BRAND_ID = originalBrandId;
  });

  it('produces a brief conforming to the P1-B contract shape', () => {
    const brief = buildHyperframesBrief({
      stageName: 'Introduction à la thermodynamique',
      sceneTitle: 'Le premier principe',
      locale: 'fr-FR',
      audience: 'learners',
      tone: 'engaging',
      objective: 'inform',
      durationS: 45,
    });

    expect(brief).toEqual({
      brand_id: 'qalem-test-brand',
      intent: 'Introduction à la thermodynamique — Le premier principe',
      audience: 'learners',
      channel_format: [{ channel: 'classroom', aspect: '16:9' }],
      language: { primary: 'fr' },
      tone: 'engaging',
      duration_s: 45,
      objective: 'inform',
      sound: { captions_burned: true },
    });
  });

  it('clamps duration_s to the documented 10-180 range', () => {
    const tooShort = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'en-US',
      audience: 'a',
      tone: 't',
      objective: 'o',
      durationS: 3,
    });
    expect(tooShort.duration_s).toBe(10);

    const tooLong = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'en-US',
      audience: 'a',
      tone: 't',
      objective: 'o',
      durationS: 999,
    });
    expect(tooLong.duration_s).toBe(180);
  });

  it('appends optional notes to the intent', () => {
    const brief = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'ar-MA',
      audience: 'a',
      tone: 't',
      objective: 'o',
      durationS: 30,
      notes: 'Insister sur le graphique final.',
    });
    expect(brief.intent).toBe('S — X. Insister sur le graphique final.');
    expect(brief.language.primary).toBe('ar');
  });

  it('throws when MISHKAT_BRAND_ID is not configured', () => {
    delete process.env.MISHKAT_BRAND_ID;
    expect(() =>
      buildHyperframesBrief({
        stageName: 'S',
        sceneTitle: 'X',
        locale: 'fr-FR',
        audience: 'a',
        tone: 't',
        objective: 'o',
        durationS: 30,
      }),
    ).toThrow(/MISHKAT_BRAND_ID/);
  });
});
