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

  it('produces a brief conforming to the current Mishkāt schema', () => {
    const brief = buildHyperframesBrief({
      stageName: 'Introduction à la thermodynamique',
      sceneTitle: 'Le premier principe',
      locale: 'fr-FR',
      audience: 'etudiant',
      tone: 'pedagogique',
      objective: 'awareness',
      durationS: 45,
    });

    expect(brief).toEqual({
      brand_id: 'qalem-test-brand',
      intent: 'Introduction à la thermodynamique — Le premier principe',
      audience: 'etudiant',
      channel_format: [{ channel: 'presentation', aspect: '16:9' }],
      language: { primary: 'fr', rtl: false },
      tone: 'pedagogique',
      duration_s: 45,
      objective: 'awareness',
      sound: { music: true, voiceover: true, captions_burned: true },
    });
  });

  it('clamps duration_s to the documented 10-180 range', () => {
    const tooShort = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'en-US',
      audience: 'etudiant',
      tone: 'default',
      objective: 'awareness',
      durationS: 3,
    });
    expect(tooShort.duration_s).toBe(10);

    const tooLong = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'en-US',
      audience: 'etudiant',
      tone: 'default',
      objective: 'awareness',
      durationS: 999,
    });
    expect(tooLong.duration_s).toBe(180);
  });

  it('appends optional notes to the intent', () => {
    const brief = buildHyperframesBrief({
      stageName: 'S',
      sceneTitle: 'X',
      locale: 'ar-MA',
      audience: 'etudiant',
      tone: 'pedagogique',
      objective: 'awareness',
      durationS: 30,
      notes: 'Insister sur le graphique final.',
    });
    expect(brief.intent).toBe('S — X. Insister sur le graphique final.');
    expect(brief.language.primary).toBe('ar');
    expect(brief.language.rtl).toBe(true);
  });

  it('throws when MISHKAT_BRAND_ID is not configured', () => {
    delete process.env.MISHKAT_BRAND_ID;
    expect(() =>
      buildHyperframesBrief({
        stageName: 'S',
        sceneTitle: 'X',
        locale: 'fr-FR',
        audience: 'etudiant',
        tone: 'default',
        objective: 'awareness',
        durationS: 30,
      }),
    ).toThrow(/MISHKAT_BRAND_ID/);
  });
});
