import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesignDirectiveFields } from '@/components/generation/design-directive-fields';
import { brandCharterFromSettings, type BrandCharter } from '@/lib/branding/brand-charter';
import { DEFAULT_DESIGN_DIRECTIVE } from '@/lib/branding/design-directive';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`,
  }),
}));

const charter: BrandCharter = {
  sourceUrl: 'https://ai-mpower.com/',
  colors: { background: '#F3EFE4', ink: '#102A43', accent: '#0B8F8A' },
  headingFont: 'Merriweather',
  bodyFont: 'Inter',
};

function render(brandCharter?: BrandCharter | null) {
  return renderToStaticMarkup(
    createElement(DesignDirectiveFields, {
      directive: DEFAULT_DESIGN_DIRECTIVE,
      onChange: () => undefined,
      disabled: false,
      designSystemEnabled: true,
      brandCharter,
      courseTitle: 'Cours',
      sampleTitle: 'Titre',
      samplePoints: ['Point'],
    }),
  );
}

/** The `<select>` elements, in the order of the form: tone, density, hue, chroma, fonts. */
const selects = (html: string) => html.match(/<select\b[^>]*>/gu) ?? [];
/** The attribute, not the Tailwind class `disabled:...` that every field carries. */
const isLocked = (tag: string) => / disabled=""/u.test(tag);

describe('design fields with a tenant charter', () => {
  it('says whose charter applies and locks hue, intensity and both fonts', () => {
    const html = render(charter);
    expect(html).toContain('design-charter-locked');
    expect(html).toContain('ai-mpower.com');
    const tags = selects(html);
    expect(tags).toHaveLength(6);
    // tone and density stay editable; hue, chroma, heading and body fonts are locked.
    expect(tags.map(isLocked)).toEqual([false, false, true, true, true, true]);
  });

  it('shows the charter fonts, not the directive fonts', () => {
    const html = render(charter);
    expect(html).toContain('<option value="Merriweather" selected');
  });

  it('keeps every field editable for a tenant without charter', () => {
    const html = render(null);
    expect(html).not.toContain('design-charter-locked');
    expect(selects(html).some(isLocked)).toBe(false);
  });
});

describe('brandCharterFromSettings', () => {
  it('is null for a tenant without charter', () => {
    expect(brandCharterFromSettings({})).toBeNull();
    expect(brandCharterFromSettings(undefined)).toBeNull();
  });

  it('exposes the colours, the fonts and the site of the saved charter', () => {
    const result = brandCharterFromSettings({
      brandDesignSystem: {
        version: 1,
        sourceUrl: 'https://ai-mpower.com/',
        extractedAt: '2026-10-12T00:00:00.000Z',
        palette: [
          { name: 'background', hex: '#F3EFE4', purpose: '' },
          { name: 'ink', hex: '#102A43', purpose: '' },
          { name: 'accent', hex: '#0B8F8A', purpose: '' },
        ],
        typography: {
          display: 'Iowan Old Style, Palatino, Georgia, serif',
          body: 'Aptos, Segoe UI, sans-serif',
          utility: 'Consolas, monospace',
        },
        spacingRhythm: '',
        cornerRadius: '',
        borderAndShadow: '',
        density: '',
        layoutLogic: 'grid',
        signatureElement: '',
        never: [],
        inferred: [],
      },
    });
    expect(result).toMatchObject({
      sourceUrl: 'https://ai-mpower.com/',
      // The charter serialization darkens an accent that is not readable on the paper (4.5:1).
      colors: { background: '#F3EFE4', accent: '#097773' },
      headingFont: 'Merriweather',
      bodyFont: 'Inter',
    });
  });
});
