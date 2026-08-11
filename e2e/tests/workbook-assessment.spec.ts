import { expect, test } from '../fixtures/base';
import { generateWorkbookWithPython } from '../../lib/server/workbook-python';

test('évalue réellement un classeur Qalem avec Python dans le runtime Next.js', async ({
  request,
}) => {
  const workbook = await generateWorkbookWithPython(
    { sheets: [{ name: 'Placeholder', rows: [['unused']] }] },
    'cash-flow-13-week',
  );

  const response = await request.post('/api/pbl/v2/evaluate-workbook', {
    multipart: {
      workbook: {
        name: 'tresorerie-13-semaines.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: workbook,
      },
    },
  });

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
