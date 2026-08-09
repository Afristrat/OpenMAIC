import JSZip from 'jszip';
import { binarize, Decoder, Detector, grayscale } from '@nuintun/qrcode';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildXlsx,
  createResourceShortCode,
  generateQrPng,
} from '@/lib/server/classroom-resource-generation';

describe('classroom resource generation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('always creates a five-character code with upper, lower and numeric characters', () => {
    for (let index = 0; index < 100; index += 1) {
      const code = createResourceShortCode();
      expect(code).toMatch(/^[a-zA-Z0-9]{5}$/);
      expect(code).toMatch(/[A-Z]/);
      expect(code).toMatch(/[a-z]/);
      expect(code).toMatch(/[0-9]/);
    }
  });

  it('builds a real multi-sheet XLSX with values, formulas and escaped text', async () => {
    const workbook = await buildXlsx({
      sheets: [
        {
          name: 'Budget & hypothèses',
          rows: [
            ['Poste', 'Montant'],
            ['Revenus <nets>', 1200],
            ['Total', '=SUM(B2:B2)'],
          ],
        },
        {
          name: 'Scénarios',
          rows: [
            ['Nom', 'Actif'],
            ['Base', true],
          ],
        },
      ],
    });

    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(workbook);
    const manifest = await zip.file('xl/workbook.xml')!.async('string');
    const firstSheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(manifest).toContain('Budget &amp; hypothèses');
    expect(manifest).toContain('Scénarios');
    expect(firstSheet).toContain('Revenus &lt;nets&gt;');
    expect(firstSheet).toContain('<f>SUM(B2:B2)</f>');
  });

  it('generates the resource QR locally as a real 320px PNG', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const target = 'https://qalem.ma/Blf5Q';

    const qr = await generateQrPng(target);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(qr.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await expect(sharp(qr).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 320,
      height: 320,
    });

    const { data, info } = await sharp(qr)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const luminances = grayscale({
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      colorSpace: 'srgb',
    } as ImageData);
    const detections = new Detector().detect(binarize(luminances, info.width, info.height));
    const decoder = new Decoder();
    let decoded: string | undefined;
    let current = detections.next();
    while (!current.done) {
      let succeeded = false;
      try {
        decoded = decoder.decode(current.value.matrix).content;
        succeeded = true;
      } catch {
        // A detector may yield geometric candidates that are not QR symbols.
      }
      if (succeeded) break;
      current = detections.next(false);
    }
    expect(decoded).toBe(target);
  });
});
