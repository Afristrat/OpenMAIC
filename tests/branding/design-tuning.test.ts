import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESIGN_TUNING,
  designTuningFromSettings,
  normalizeDesignTuning,
  parseDesignTuning,
  serializeDesignTuning,
} from '@/lib/branding/design-tuning';
import {
  DEFAULT_DESIGN_DIRECTIVE,
  buildPalette,
  resolveSlideSurface,
} from '@/lib/branding/design-directive';
import { serializeBrandSnapshot } from '@/lib/branding/organization-design-system';

describe('design tuning', () => {
  it('bounds every value and falls back to the defaults', () => {
    expect(normalizeDesignTuning(undefined)).toEqual(DEFAULT_DESIGN_TUNING);
    expect(
      normalizeDesignTuning({ tintStrength: 9, cardOpacity: -1, spotlightDimness: 'x' }),
    ).toEqual({
      tintStrength: 0.45,
      cardOpacity: 0.5,
      spotlightDimness: DEFAULT_DESIGN_TUNING.spotlightDimness,
    });
    expect(designTuningFromSettings({ designTuning: { cardOpacity: 0.9 } }).cardOpacity).toBe(0.9);
  });

  it('round-trips through the snapshot line and ignores a malformed one', () => {
    const tuning = { tintStrength: 0.35, cardOpacity: 0.6, spotlightDimness: 0.1 };
    expect(parseDesignTuning(`colors: a\n${serializeDesignTuning(tuning)}`)).toEqual(tuning);
    expect(parseDesignTuning('tuning: tint=abc')).toEqual(DEFAULT_DESIGN_TUNING);
    expect(parseDesignTuning(undefined)).toEqual(DEFAULT_DESIGN_TUNING);
  });

  it('makes the pastel surfaces stronger or weaker without touching the default look', () => {
    const lighter = buildPalette(DEFAULT_DESIGN_DIRECTIVE, {
      ...DEFAULT_DESIGN_TUNING,
      tintStrength: 0.15,
    });
    const stronger = buildPalette(DEFAULT_DESIGN_DIRECTIVE, {
      ...DEFAULT_DESIGN_TUNING,
      tintStrength: 0.4,
    });
    expect(lighter['surface.tint']).not.toBe(stronger['surface.tint']);
    expect(buildPalette(DEFAULT_DESIGN_DIRECTIVE)).toEqual(
      buildPalette(DEFAULT_DESIGN_DIRECTIVE, DEFAULT_DESIGN_TUNING),
    );
  });

  it('freezes the tuning in the brand snapshot and applies it to the surfaces', () => {
    const snapshotText = serializeBrandSnapshot(
      {
        version: 1,
        sourceUrl: 'https://example.test',
        extractedAt: '2026-10-12T00:00:00.000Z',
        palette: [{ name: 'accent', hex: '#0A72A1', purpose: 'accent' }],
        typography: { display: 'Inter', body: 'Inter', utility: 'Inter' },
        layoutLogic: 'grille',
        signatureElement: 'liseré',
        cornerRadius: '8',
        borderAndShadow: 'aucune',
        spacingRhythm: 'large',
        density: 'aérée',
        never: [],
        inferred: [],
      },
      { tintStrength: 0.4, cardOpacity: 0.55, spotlightDimness: 0.3 },
    );
    expect(snapshotText.text.length).toBeLessThanOrEqual(1200);
    const brandSnapshot = {
      version: 1 as const,
      createdAt: '2026-10-12',
      content: snapshotText.text,
    };
    expect(
      resolveSlideSurface('content', { ...DEFAULT_DESIGN_DIRECTIVE }, brandSnapshot).cardOpacity,
    ).toBe(0.55);
  });
});
