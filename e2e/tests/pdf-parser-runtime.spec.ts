import { expect, test } from '@playwright/test';

function buildTextPdf(text: string): Buffer {
  const escapedText = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const content = `BT /F1 18 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('parses a PDF through the production Next.js runtime', async ({ request }) => {
  const response = await request.post('/api/parse-pdf', {
    multipart: {
      pdf: {
        name: 'qalem-runtime-smoke.pdf',
        mimeType: 'application/pdf',
        buffer: buildTextPdf('Qalem PDF smoke test'),
      },
      providerId: 'unpdf',
    },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data?: { text?: string; metadata?: { pageCount?: number; parser?: string } };
  };
  expect(body.success).toBe(true);
  expect(body.data?.text).toContain('Qalem PDF smoke test');
  expect(body.data?.metadata).toMatchObject({ pageCount: 1, parser: 'unpdf' });
});
