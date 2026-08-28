import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const mocks = vi.hoisted(() => ({ extractReadablePdf: vi.fn() }));

vi.mock('@/lib/server/pdf-document-extraction', () => ({
  extractReadablePdf: mocks.extractReadablePdf,
}));

import {
  extractCourseImportDocument,
  extractStructuredDocx,
} from '@/lib/server/course-import-document';

function paragraph(text: string, style?: string): string {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

describe('extractStructuredDocx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes Word heading styles to the Markdown hierarchy required by the canvas', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document><w:body>${paragraph('Ma formation', 'Titre1')}${paragraph('Résultat professionnel visé', 'Titre2')}${paragraph('Décider.')}${paragraph('Objectif observable', 'Titre3')}${paragraph('Produire un plan.')}</w:body></w:document>`,
    );

    await expect(
      extractStructuredDocx(await zip.generateAsync({ type: 'nodebuffer' })),
    ).resolves.toBe(
      '# Ma formation\n\n## Résultat professionnel visé\n\nDécider.\n\n### Objectif observable\n\nProduire un plan.',
    );
  });

  it('delegates PDF structure extraction to the existing MinerU provider', async () => {
    mocks.extractReadablePdf.mockResolvedValue({
      providerId: 'mineru',
      content: {
        text: '# Formation\n\n## Chapitre 1 — Décider',
        images: [],
        metadata: { pageCount: 1, parser: 'mineru' },
      },
    });
    const buffer = Buffer.from('%PDF-1.4');

    await expect(
      extractCourseImportDocument({
        buffer,
        fileName: 'canevas.pdf',
        fileSize: buffer.byteLength,
        mimeType: 'application/pdf',
        pdfProviderId: 'mineru',
      }),
    ).resolves.toMatchObject({
      parserId: 'mineru',
      content: { text: expect.stringContaining('Chapitre 1') },
    });
    expect(mocks.extractReadablePdf).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'mineru', fileName: 'canevas.pdf' }),
    );
  });
});
