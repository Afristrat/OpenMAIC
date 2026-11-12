import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { LOGO_ACCEPTED_TYPES } from '@/lib/branding/logo-formats';
import { prepareLogoUpload } from '@/lib/branding/logo-upload';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect width="200" height="100" fill="#0a5"/><circle cx="50" cy="50" r="30" fill="#fff"/>
</svg>`;

const svgFile = (text: string) => new File([text], 'logo.svg', { type: 'image/svg+xml' });

describe('prepareLogoUpload', () => {
  it('accepte le SVG en plus des formats matriciels', () => {
    expect(LOGO_ACCEPTED_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  });

  it('laisse un format matriciel tel quel', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    const prepared = await prepareLogoUpload(file);
    expect(prepared?.contentType).toBe('image/png');
    expect(Array.from(new Uint8Array(prepared!.bytes))).toEqual([1, 2, 3]);
  });

  it('convertit un SVG en PNG haute définition, fond transparent conservé', async () => {
    const prepared = await prepareLogoUpload(svgFile(SVG));
    expect(prepared?.contentType).toBe('image/png');
    const bytes = Buffer.from(prepared!.bytes);
    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(1024);
    expect(meta.hasAlpha).toBe(true);
  });

  it('ne conserve aucun script : le fichier stocké est une image matricielle', async () => {
    const hostile = SVG.replace('</svg>', '<script>alert(1)</script></svg>').replace(
      '<rect',
      '<rect onload="alert(1)"',
    );
    const prepared = await prepareLogoUpload(svgFile(hostile));
    const bytes = Buffer.from(prepared!.bytes);
    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(bytes.toString('latin1')).not.toMatch(/<script|alert\(1\)/);
  });

  it.each([
    ['une déclaration DOCTYPE', `<!DOCTYPE svg [<!ENTITY a "x">]>${SVG}`],
    ['une entité externe', `<!ENTITY xxe SYSTEM "file:///etc/passwd">${SVG}`],
    ['un document illisible', '<svg'],
    ['un SVG sans dimension', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    [
      'un SVG aux dimensions démesurées',
      '<svg xmlns="http://www.w3.org/2000/svg" width="900000" height="900000"/>',
    ],
  ])('refuse %s', async (_label, text) => {
    expect(await prepareLogoUpload(svgFile(text))).toBeNull();
  });

  it('refuse un type non pris en charge', async () => {
    const file = new File(['<html/>'], 'logo.html', { type: 'text/html' });
    expect(await prepareLogoUpload(file)).toBeNull();
  });
});
