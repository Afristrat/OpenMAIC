import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  billboardLanguage,
  billboardPalette,
  buildBillboardSvg,
  planBillboards,
  DEFAULT_BILLBOARD_PALETTE,
} from '@/lib/export/mp4/billboard-card';
import {
  fetchLogoDataUri,
  renderOrganizationBillboards,
  type OrganizationBillboardBrand,
} from '@/lib/export/mp4/organization-billboards';

const palette = billboardPalette({ background: '#0b3d2e', accent: '#f59e0b' });

describe('planBillboards', () => {
  test('follows the presentation mode of the organization', () => {
    expect(planBillboards({ mode: 'none' })).toBeNull();
    expect(planBillboards({ mode: 'organization' })).toEqual({
      showOrganization: true,
      showQalem: false,
    });
    expect(planBillboards({ mode: 'qalem' })).toEqual({ showOrganization: false, showQalem: true });
    expect(planBillboards({ mode: 'both' })).toEqual({ showOrganization: true, showQalem: true });
  });
});

describe('billboardPalette', () => {
  test('takes the charter colours and derives a readable ink from the background', () => {
    expect(palette).toEqual({ background: '#0b3d2e', accent: '#f59e0b', ink: '#ffffff' });
    expect(billboardPalette({ background: '#fff' }).ink).toBe('#0f172a');
  });

  test('ignores anything that is not a plain hex colour', () => {
    expect(billboardPalette({ background: 'url(javascript:x)', accent: 'red' })).toEqual({
      ...DEFAULT_BILLBOARD_PALETTE,
      ink: '#ffffff',
    });
  });
});

describe('buildBillboardSvg', () => {
  const base = {
    plan: { showOrganization: true, showQalem: true },
    organizationName: 'Cabinet <Atlas> & Fils',
    courseTitle: 'Piloter la trésorerie sur treize semaines',
    language: 'fr' as const,
    palette,
  };

  test('entry card shows the organization, the course title and the Qalem credit', () => {
    const svg = buildBillboardSvg({ ...base, kind: 'entry' });
    expect(svg).toContain('Cabinet &lt;Atlas&gt; &amp; Fils');
    expect(svg).toContain('Piloter la trésorerie');
    expect(svg).toContain('Formation');
    expect(svg).toContain('Réalisé avec Qalem');
    expect(svg).toContain('#0b3d2e');
    expect(svg).not.toContain('<Atlas>');
  });

  test('exit card thanks the learner and embeds the logo when there is one', () => {
    const svg = buildBillboardSvg({
      ...base,
      kind: 'exit',
      logoDataUri: 'data:image/png;base64,AAAA',
    });
    expect(svg).toContain('Merci de votre attention');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
  });

  test('without the organization identity the card carries the Qalem name only', () => {
    const svg = buildBillboardSvg({
      ...base,
      plan: { showOrganization: false, showQalem: true },
      kind: 'entry',
      logoDataUri: 'data:image/png;base64,AAAA',
    });
    expect(svg).toContain('>Qalem<');
    expect(svg).not.toContain('Atlas');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('Réalisé avec Qalem');
  });

  test('speaks the language of the organization, right to left for Arabic', () => {
    const arabic = buildBillboardSvg({ ...base, kind: 'exit', language: 'ar' });
    expect(arabic).toContain('direction="rtl"');
    expect(arabic).toContain('شكراً لانتباهكم');
    expect(billboardLanguage('ar-MA')).toBe('ar');
    expect(billboardLanguage('en-US')).toBe('en');
    expect(billboardLanguage(undefined)).toBe('fr');
  });
});

describe('renderOrganizationBillboards', () => {
  let directory = '';
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = '';
  });

  const brand = (
    mode: OrganizationBillboardBrand['branding']['mode'],
  ): OrganizationBillboardBrand => ({
    organizationName: 'Cabinet Atlas',
    courseTitle: 'Trésorerie',
    language: 'fr',
    branding: { mode },
    palette,
  });

  test('renders an entry and an exit segment with the same encoding as the scenes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'qalem-billboards-'));
    const calls: string[][] = [];
    const result = await renderOrganizationBillboards({
      directory,
      brand: brand('organization'),
      runFfmpeg: async (args) => {
        calls.push(args);
      },
    });
    expect(result.entry).toBe(join(directory, 'billboard-entry.mp4'));
    expect(result.exit).toBe(join(directory, 'billboard-exit.mp4'));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(expect.arrayContaining(['-t', '3', '-r', '25', '-ar', '48000']));
    expect(calls[1]).toEqual(expect.arrayContaining(['-t', '4']));
    const png = await readFile(join(directory, 'billboard-entry.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  test('draws nothing when the organization opted out or has no identity', async () => {
    directory = await mkdtemp(join(tmpdir(), 'qalem-billboards-'));
    const never = async () => {
      throw new Error('ffmpeg ne doit pas être appelé');
    };
    expect(
      await renderOrganizationBillboards({ directory, brand: brand('none'), runFfmpeg: never }),
    ).toEqual({});
    expect(
      await renderOrganizationBillboards({ directory, brand: null, runFfmpeg: never }),
    ).toEqual({});
  });

  test('a failing encoder never cancels the export: the video simply goes out without cards', async () => {
    directory = await mkdtemp(join(tmpdir(), 'qalem-billboards-'));
    const result = await renderOrganizationBillboards({
      directory,
      brand: brand('both'),
      runFfmpeg: async () => {
        throw new Error('ffmpeg indisponible');
      },
    });
    expect(result).toEqual({});
  });
});

describe('fetchLogoDataUri', () => {
  test('refuses an oversized data URI before decoding it', async () => {
    const huge = `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    expect(await fetchLogoDataUri(huge)).toBeUndefined();
  });

  test('rasterizes a small inline logo to a bounded PNG', async () => {
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(await fetchLogoDataUri(tiny)).toMatch(/^data:image\/png;base64,/);
  });
});
