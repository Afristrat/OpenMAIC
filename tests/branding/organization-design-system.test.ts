import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOrganizationImagePrompt,
  organizationDesignSystemFromSettings,
  type OrganizationDesignSystem,
} from '@/lib/branding/organization-design-system';

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const designSystem: OrganizationDesignSystem = {
  version: 1,
  sourceUrl: 'https://example.com/',
  extractedAt: '2026-08-05T00:00:00.000Z',
  palette: [
    { name: 'background', hex: '#f8f5ee', purpose: 'page background' },
    { name: 'surface', hex: '#ffffff', purpose: 'cards' },
    { name: 'ink', hex: '#151515', purpose: 'text' },
    { name: 'accent', hex: '#3157d5', purpose: 'emphasis' },
  ],
  typography: { display: 'Manrope', body: 'Inter', utility: 'Inter' },
  spacingRhythm: 'regular modular spacing',
  cornerRadius: '12px',
  borderAndShadow: 'subtle borders',
  density: 'moderately spacious',
  layoutLogic: 'responsive grid with a clear reading path',
  signatureElement: 'blue focus accents',
  never: ['clutter', 'overlapping content'],
  inferred: [],
};

describe('organization design system', () => {
  it('reads only a complete persisted design system', () => {
    expect(organizationDesignSystemFromSettings({ brandDesignSystem: designSystem })).toEqual(
      designSystem,
    );
    expect(
      organizationDesignSystemFromSettings({ brandDesignSystem: { version: 1 } }),
    ).toBeUndefined();
  });

  it('augments infographic prompts with the organization system and layout safeguards', () => {
    const prompt = buildOrganizationImagePrompt(
      'Infographie sur les flux de trésorerie',
      designSystem,
    );
    expect(prompt).toContain('Fidelity to the organization design system');
    expect(prompt).toContain('#3157d5');
    expect(prompt).toContain('Never print color codes');
    expect(prompt).toContain('no overlap');
    expect(prompt).toContain('10% safe margin');
  });

  it('extracts the rendered palette, logo and typography from Crawl4AI evidence', async () => {
    vi.stubEnv('CRAWL4AI_BASE_URL', 'http://crawl4ai:11235');
    vi.stubEnv('CRAWL4AI_API_TOKEN', 'test-token');
    const screenshot = (
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#f00030' },
      })
        .png()
        .toBuffer()
    ).toString('base64');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/html')) {
        return new Response(
          JSON.stringify({
            html: '<style>:root{color:#151515;background:#f8f5ee;font-family:Manrope,sans-serif;border-radius:12px}</style><img class="brand-logo" src="/logo.svg">',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ screenshot }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { extractOrganizationDesignSystem } =
      await import('@/lib/server/organization-brand-extractor');
    const extracted = await extractOrganizationDesignSystem('https://example.com/');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(extracted.logoUrl).toBe('https://example.com/logo.svg');
    expect(extracted.typography.display).toBe('Manrope,sans-serif');
    expect(extracted.palette.some((token) => token.hex === '#f00030')).toBe(true);
    expect(extracted.cornerRadius).toContain('12px');
  });
});
