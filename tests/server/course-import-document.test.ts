import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractStructuredDocx } from '@/lib/server/course-import-document';

function paragraph(text: string, style?: string): string {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

describe('extractStructuredDocx', () => {
  it('normalizes Word heading styles to the Markdown hierarchy required by the canvas', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document><w:body>${paragraph('Ma formation', 'Titre1')}${paragraph('Résultat professionnel visé', 'Titre2')}${paragraph('Décider.')}${paragraph('Objectif observable', 'Titre3')}${paragraph('Produire un plan.')}</w:body></w:document>`,
    );

    await expect(extractStructuredDocx(await zip.generateAsync({ type: 'nodebuffer' }))).resolves.toBe(
      '# Ma formation\n\n## Résultat professionnel visé\n\nDécider.\n\n### Objectif observable\n\nProduire un plan.',
    );
  });
});
