import { expect, test } from '../fixtures/base';
import type { APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';
import { generateWorkbookWithPython } from '../../lib/server/workbook-python';

function replaceCell(xml: string, ref: string, body: string): string {
  const pattern = new RegExp(`<c r="${ref}"([^>]*)\\s*/>|<c r="${ref}"([^>]*)>[\\s\\S]*?<\\/c>`);
  const match = xml.match(pattern);
  if (!match) throw new Error(`Cell ${ref} was not found in the generated workbook`);
  const attributes = match[1] ?? match[2] ?? '';
  return xml.replace(pattern, `<c r="${ref}"${attributes}>${body}</c>`);
}

async function completeCashFlowWorkbook(workbook: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(workbook);
  const forecastFile = zip.file('xl/worksheets/sheet3.xml');
  const scenarioFile = zip.file('xl/worksheets/sheet4.xml');
  if (!forecastFile || !scenarioFile) throw new Error('Expected cash-flow worksheets are missing');

  let forecast = await forecastFile.async('string');
  forecast = replaceCell(forecast, 'B4', '<v>125000</v>');
  for (const row of [5, 6, 8, 9, 10, 11, 12, 13, 17]) {
    for (let column = 0; column < 13; column += 1) {
      const ref = `${String.fromCharCode('B'.charCodeAt(0) + column)}${row}`;
      forecast = replaceCell(forecast, ref, `<v>${row === 17 ? 45000 : 1000}</v>`);
    }
  }
  zip.file('xl/worksheets/sheet3.xml', forecast);

  let scenario = await scenarioFile.async('string');
  const values = {
    B1: 'Retard de paiement de deux clients majeurs pendant trois semaines',
    B2: 'Négocier un étalement fournisseur avant le franchissement du seuil',
    B3: 'La décision protège le point bas de trésorerie calculé par le modèle',
  };
  for (const [ref, value] of Object.entries(values)) {
    scenario = replaceCell(scenario, ref, `<is><t xml:space="preserve">${value}</t></is>`).replace(
      new RegExp(`<c r="${ref}"(?![^>]*t=)`),
      `<c r="${ref}" t="inlineStr"`,
    );
  }
  zip.file('xl/worksheets/sheet4.xml', scenario);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function assessWorkbook(request: APIRequestContext, workbook: Buffer) {
  return request.post('/api/pbl/v2/evaluate-workbook', {
    multipart: {
      workbook: {
        name: 'tresorerie-13-semaines.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: workbook,
      },
    },
  });
}

test('évalue réellement un classeur Qalem avec Python dans le runtime Next.js', async ({
  request,
}) => {
  const workbook = await generateWorkbookWithPython(
    { sheets: [{ name: 'Placeholder', rows: [['unused']] }] },
    'cash-flow-13-week',
  );

  const response = await assessWorkbook(request, workbook);

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    assessment: {
      profile: 'cash-flow-13-week',
      authority: 'python-deterministic',
      score: 55,
      metrics: { currency: 'MAD' },
    },
  });
});

test('reconnaît un classeur réellement complété et conserve le diagnostic Python', async ({
  request,
}) => {
  const template = await generateWorkbookWithPython({}, 'cash-flow-13-week');
  const workbook = await completeCashFlowWorkbook(template);
  const response = await assessWorkbook(request, workbook);

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    assessment: {
      profile: 'cash-flow-13-week',
      authority: 'python-deterministic',
      score: 100,
      verdict: 'Maîtrise démontrée',
      metrics: {
        currency: 'MAD',
        minimumCashWeek: 13,
      },
      checks: [
        { id: 'structure', passed: true },
        { id: 'completeness', passed: true },
        { id: 'formulas', passed: true },
        { id: 'signs', passed: true },
        { id: 'calculation', passed: true },
        { id: 'scenario', passed: true },
      ],
    },
  });
});
