import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractBrandFromSources } from '@/lib/branding/brand-extraction';
import { serializeBrandSnapshot } from '@/lib/branding/organization-design-system';

// Reduced from the real sites: ai-mpower.com declares its charter in a stylesheet (CSS variables,
// font stacks); sahambank.com in inline literals plus a Google Fonts link.
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const color = (palette: Array<{ name: string; hex: string }>, name: string) =>
  palette.find((token) => token.name === name)?.hex;

describe('extractBrandFromSources', () => {
  it('reads the charter a site declares in its stylesheet: paper, ink, accent, serif titles', () => {
    const brand = extractBrandFromSources({
      html: '<html><head><link rel="stylesheet" href="src/styles.css"></head></html>',
      css: [fixture('ai-mpower.css')],
      screenshotColors: [],
    });
    expect(color(brand.palette, 'background')).toBe('#F3EFE4');
    expect(color(brand.palette, 'surface')).toBe('#E9E1D1');
    expect(color(brand.palette, 'ink')).toBe('#102A43');
    expect(color(brand.palette, 'accent')).toBe('#0B8F8A');
    expect(color(brand.palette, 'secondary')).toBe('#9F3D29');
    expect(brand.fonts.display).toContain('Georgia');
    expect(brand.fonts.body).toContain('Aptos');
    expect(brand.inferred).toEqual([]);
  });

  it('reads literal colours by usage and the Google Fonts family of a site without variables', () => {
    const brand = extractBrandFromSources({
      html: fixture('saham-bank.html'),
      css: [],
      screenshotColors: [],
    });
    expect(color(brand.palette, 'accent')).toBe('#E04562');
    expect(color(brand.palette, 'secondary')).toBe('#17A8E3');
    expect(color(brand.palette, 'background')).toBe('#FFFFFF');
    expect(brand.fonts.body).toBe('Montserrat, sans-serif');
    expect(brand.fonts.display).toBe('Source Sans Pro, sans-serif');
  });

  it('never invents a colour: nothing detected means nothing in the palette but the paper', () => {
    const brand = extractBrandFromSources({
      html: '<html><body>Bonjour</body></html>',
      css: [],
      screenshotColors: [],
    });
    expect(brand.palette.map((token) => token.name)).toEqual(['background']);
    expect(brand.inferred.join(' ')).toContain('Accent non détecté');
    expect(brand.fonts.display).toBeUndefined();
  });

  it('ignores the default palettes of WordPress, Bootstrap and Tailwind', () => {
    const brand = extractBrandFromSources({
      html: '<style>:root{--wp--preset--color--pale-pink:#f78da7;--bs-primary:#0d6efd;--tw-ring-color:#3b82f6;--brand-primary:#6a1b9a}.a{color:#6a1b9a}</style>',
      css: [],
      screenshotColors: [],
    });
    expect(color(brand.palette, 'accent')).toBe('#6A1B9A');
    expect(color(brand.palette, 'secondary')).toBeUndefined();
  });

  it('ignores a stylesheet font that is a colour variable', () => {
    const brand = extractBrandFromSources({
      html: '',
      css: [
        ':root{--signal-teal-text:#08716d;--body:Aptos,sans-serif}body{font-family:var(--body)}',
      ],
      screenshotColors: [],
    });
    expect(brand.fonts.body).toBe('Aptos, sans-serif');
  });
});

describe('charter font mapping', () => {
  const mapped = (display: string) =>
    serializeBrandSnapshot({
      version: 1,
      sourceUrl: 'https://tenant.test/',
      extractedAt: '2026-10-12T00:00:00.000Z',
      palette: [],
      typography: { display, body: display, utility: display },
      spacingRhythm: '',
      cornerRadius: '',
      borderAndShadow: '',
      density: '',
      layoutLogic: '',
      signatureElement: '',
      never: [],
      inferred: [],
    }).text.match(/fonts: display=([^;]+)/u)?.[1];

  it('keeps an available family and treats sans-serif as a sans family', () => {
    expect(mapped('Montserrat')).toBe('Montserrat');
    expect(mapped('Inter, sans-serif')).toBe('Inter');
    expect(mapped('Helvetica Neue, Arial, sans-serif')).toBe('Inter');
  });

  it('maps a serif stack to the serif the platform can render', () => {
    expect(mapped('Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif')).toBe(
      'Merriweather',
    );
    expect(mapped('Consolas, SFMono-Regular, monospace')).toBe('JetBrains Mono');
  });
});
