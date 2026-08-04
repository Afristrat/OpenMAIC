import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildXlsx,
  createResourceShortCode,
} from '@/lib/server/classroom-resource-generation';

describe('classroom resource generation', () => {
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
        { name: 'Scénarios', rows: [['Nom', 'Actif'], ['Base', true]] },
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
});
