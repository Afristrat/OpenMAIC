import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';
import { DESIGN_FONTS } from '@openmaic/dsl';
import {
  serializeBrandSnapshot,
  type OrganizationDesignSystem,
} from './organization-design-system';

function charter(overrides: Partial<OrganizationDesignSystem> = {}): OrganizationDesignSystem {
  return {
    version: 1,
    sourceUrl: 'https://private.example/brand.pdf',
    extractedAt: '2026-01-02T03:04:05.000Z',
    palette: [
      { name: 'background', hex: '#FFFFFF', purpose: 'fond principal' },
      { name: 'surface', hex: '#F4F5F7', purpose: 'cartes' },
      { name: 'ink', hex: '#777777', purpose: 'texte courant' },
      { name: 'accent', hex: '#F0AA00', purpose: 'accent' },
      { name: 'muted', hex: '#777777', purpose: 'secondaire' },
    ],
    typography: { display: 'Brand Display Pro', body: 'Arial', utility: 'Roboto Mono' },
    spacingRhythm: '8 px multiples',
    cornerRadius: '12 px',
    borderAndShadow: 'soft border, no shadow',
    density: 'balanced',
    layoutLogic: 'one clear reading path',
    signatureElement: 'thin amber rule',
    never: ['No decorative gradients'],
    inferred: ['must not appear in snapshot'],
    ...overrides,
  };
}

describe('serializeBrandSnapshot', () => {
  it('is deterministic, compact, and excludes extraction metadata', () => {
    const input = charter();
    const first = serializeBrandSnapshot(input);
    const second = serializeBrandSnapshot({
      ...input,
      sourceUrl: 'https://other.example',
      extractedAt: 'later',
    });
    expect(first.text).toBe(second.text);
    expect(first.text.length).toBeLessThanOrEqual(1200);
    expect(first.text).not.toContain('private.example');
    expect(first.text).not.toContain('2026-01-02');
    expect(first.text).not.toContain('must not appear');
  });

  it('maps requested fonts to the allowed list and logs deviations', () => {
    const result = serializeBrandSnapshot(charter());
    const fontLine = result.text.match(/fonts: (.+)/)?.[1] ?? '';
    for (const role of ['display', 'body', 'utility']) {
      const font = fontLine.match(new RegExp(`${role}=([^;]+)`))?.[1];
      expect(font).toBeTruthy();
      expect(DESIGN_FONTS).toContain(font);
    }
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Brand Display Pro'),
        expect.stringContaining('Arial'),
        expect.stringContaining('Roboto Mono'),
      ]),
    );
  });

  it('adjusts every foreground role to at least 4.5:1 against common surfaces', () => {
    const result = serializeBrandSnapshot(charter());
    const values = Object.fromEntries(
      result.text
        .split('\n')[0]
        .replace('colors: ', '')
        .split(' ')
        .map((entry) => entry.split('=')),
    );
    for (const role of ['ink', 'accent', 'muted']) {
      expect(tinycolor.readability(values[role], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(tinycolor.readability(values[role], '#F4F5F7')).toBeGreaterThanOrEqual(4.5);
    }
    expect(result.warnings).toContainEqual(expect.stringContaining('contraste insuffisant'));
  });

  it('stays within the limit for five long tenant charters', () => {
    const long = (value: string) => value.repeat(200);
    const fixtures = Array.from({ length: 5 }, (_, index) =>
      charter({
        palette: charter().palette.map((token) => ({
          ...token,
          purpose: long(`tenant-${index}-`),
        })),
        spacingRhythm: long('8px '),
        cornerRadius: long('12px '),
        borderAndShadow: long('soft '),
        density: long('balanced '),
        layoutLogic: long('layout '),
        signatureElement: long('signature '),
        never: Array.from({ length: 10 }, () => long('avoid ')),
      }),
    );
    for (const fixture of fixtures) {
      expect(serializeBrandSnapshot(fixture).text.length).toBeLessThanOrEqual(1200);
    }
  });

  it('warns and omits malformed colors instead of inventing a tenant palette', () => {
    const result = serializeBrandSnapshot(
      charter({ palette: [{ name: 'ink', hex: 'not-a-color', purpose: 'bad' }] }),
    );
    expect(result.text).not.toContain('ink=');
    expect(result.warnings).toContainEqual(expect.stringContaining('couleur invalide'));
  });
});
