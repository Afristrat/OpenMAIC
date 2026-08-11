import { describe, expect, it } from 'vitest';
import type { Slide } from '@openmaic/dsl';

import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { buildLearningResourceSlide } from '@/lib/generation/scene-generator';
import type { GeneratedLearningResource, SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'download-budget',
  type: 'slide',
  title: 'Téléchargement du classeur Excel',
  description: 'Téléchargez puis ouvrez le classeur avant de poursuivre.',
  keyPoints: ['Scannez le QR code', 'Utilisez le lien court', 'Conservez le nom du fichier'],
  order: 4,
};

function resource(id: string, code: string): GeneratedLearningResource {
  return {
    id,
    format: 'xlsx',
    title: `Budget ${id}`,
    fileName: `budget-${id}.xlsx`,
    downloadUrl: `https://qalem.ma/${code}`,
    qrImageUrl: `/api/classroom-media/class/resources/${id}-qr.png`,
  };
}

describe('deterministic learning-resource slide', () => {
  it.each([[[resource('one', 'A7bK2')]], [[resource('one', 'A7bK2'), resource('two', 'Z9xY3')]]])(
    'keeps every trusted QR and short link visible without a layout defect',
    (resources) => {
      const content = buildLearningResourceSlide(outline, resources);
      const serialized = JSON.stringify(content.elements);

      for (const item of resources) {
        expect(serialized).toContain(item.qrImageUrl);
        expect(serialized).toContain(item.downloadUrl);
        expect(serialized).toContain(item.fileName);
      }
      expect(
        auditSlideLayout({
          id: outline.id,
          elements: content.elements,
          viewportSize: 1000,
          viewportRatio: 0.5625,
        } as Slide),
      ).toEqual([]);
    },
  );

  it('escapes outline and resource text before inserting it into slide HTML', () => {
    const unsafe = resource('unsafe', 'Q1aB2');
    unsafe.title = '<script>alert(1)</script>';
    const content = buildLearningResourceSlide(
      { ...outline, title: '<img src=x onerror=alert(1)>' },
      [unsafe],
    );
    const serialized = JSON.stringify(content.elements);

    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('<img src=x');
    expect(serialized).toContain('&lt;script&gt;');
    expect(serialized).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
