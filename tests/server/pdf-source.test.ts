import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ uploadClassroomMedia: vi.fn() }));
vi.mock('@/lib/server/classroom-media-generation', () => ({
  uploadClassroomMedia: mocks.uploadClassroomMedia,
}));

import {
  normalizePdfImages,
  persistSelectedPdfImages,
  uploadedPdfSource,
} from '@/lib/server/pdf-source';

describe('PDF source preservation', () => {
  beforeEach(() => mocks.uploadClassroomMedia.mockReset());

  test('normalizes legacy image strings without discarding rich metadata', () => {
    const images = normalizePdfImages({
      name: 'source.pdf',
      text: 'content',
      images: [
        'data:image/png;base64,YQ==',
        { id: 'diagram', src: 'data:image/png;base64,Yg==', pageNumber: 7, width: 800 },
      ],
    });

    expect(images[0]).toMatchObject({ id: 'img_1', pageNumber: 0 });
    expect(images[1]).toMatchObject({ id: 'diagram', pageNumber: 7, width: 800 });
  });

  test('persists the uploaded source as author-visible metadata without a fake URL', () => {
    expect(uploadedPdfSource({ name: 'process.pdf', text: '12345', images: ['image'] })).toEqual({
      kind: 'uploaded',
      title: 'process.pdf',
      excerpt: 'Document fourni par l’auteur : 5 caractères extraits et 1 illustration(s).',
    });
  });

  test('uploads only images selected by the approved outline', async () => {
    const mapping = await persistSelectedPdfImages(
      'classroom-id',
      [
        { id: 'img_1', src: 'data:image/png;base64,YQ==', pageNumber: 1 },
        { id: 'img_2', src: 'data:image/png;base64,Yg==', pageNumber: 2 },
      ],
      new Set(['img_2']),
    );

    expect(mocks.uploadClassroomMedia).toHaveBeenCalledOnce();
    expect(mocks.uploadClassroomMedia).toHaveBeenCalledWith(
      'classroom-id',
      'media/source-img_2.png',
      expect.any(Buffer),
    );
    expect(mapping).toEqual({
      img_2: '/api/classroom-media/classroom-id/media/source-img_2.png',
    });
  });
});
