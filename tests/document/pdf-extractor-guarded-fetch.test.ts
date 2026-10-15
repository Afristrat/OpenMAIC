import { describe, expect, it, vi } from 'vitest';

const parsePDF = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pdf/pdf-providers', () => ({ parsePDF }));

describe('extracteur PDF : fetch gardé', () => {
  it('transmet le fetch gardé de la configuration à parsePDF', async () => {
    parsePDF.mockResolvedValue({ text: 'bonjour', images: [], metadata: { pageCount: 1 } });
    const { pdfDocumentExtractorProviders } = await import('@/lib/document/extractors/pdf');
    const mineru = pdfDocumentExtractorProviders.find((p) => p.id === 'mineru');
    const guarded = vi.fn() as unknown as typeof fetch;

    await mineru?.extract({
      buffer: Buffer.from('%PDF-1.4'),
      fileName: 'a.pdf',
      fileSize: 8,
      mimeType: 'application/pdf',
      config: { providerId: 'mineru', baseUrl: 'https://user.example.com', fetch: guarded },
    });

    expect(parsePDF.mock.calls[0][0]).toMatchObject({
      providerId: 'mineru',
      baseUrl: 'https://user.example.com',
      fetch: guarded,
    });
  });
});
