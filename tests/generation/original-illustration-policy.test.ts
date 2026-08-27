import { describe, expect, it } from 'vitest';
import {
  enforceOriginalIllustrations,
  isGeneratedIllustrationUrl,
} from '@/lib/generation/original-illustration-policy';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'outline-1',
  type: 'slide',
  title: 'Le cycle de l’eau',
  description: 'Expliquer les changements d’état.',
  keyPoints: ['Évaporation', 'Condensation'],
  order: 1,
};

describe('original illustration policy', () => {
  it('replaces a source-image suggestion with one original generation request', () => {
    const [result] = enforceOriginalIllustrations(
      [{ ...outline, suggestedImageIds: ['img_pdf_1'] }],
      true,
    );

    expect(result.suggestedImageIds).toBeUndefined();
    expect(result.mediaGenerations).toHaveLength(1);
    expect(result.mediaGenerations?.[0]).toEqual(
      expect.objectContaining({
        type: 'image',
        elementId: 'gen_img_original_outline-1',
        aspectRatio: '16:9',
      }),
    );
    expect(result.mediaGenerations?.[0]?.prompt).toContain(
      'Do not reproduce, trace, imitate, or reuse any image from the supplied documents.',
    );
  });

  it('hardens an existing generated-image request without duplicating it', () => {
    const request = {
      type: 'image' as const,
      elementId: 'gen_img_1',
      prompt: 'Show evaporation and condensation.',
      aspectRatio: '16:9' as const,
    };
    const [once] = enforceOriginalIllustrations(
      [{ ...outline, suggestedImageIds: ['img_pdf_1'], mediaGenerations: [request] }],
      true,
    );
    const [twice] = enforceOriginalIllustrations([once], true);

    expect(once.suggestedImageIds).toBeUndefined();
    expect(once.mediaGenerations).toHaveLength(1);
    expect(twice.mediaGenerations).toEqual(once.mediaGenerations);
  });

  it('strips source suggestions without creating media when generation is disabled', () => {
    const [result] = enforceOriginalIllustrations(
      [{ ...outline, suggestedImageIds: ['img_pdf_1'] }],
      false,
    );

    expect(result.suggestedImageIds).toBeUndefined();
    expect(result.mediaGenerations).toBeUndefined();
  });

  it('accepts only the generated element media URL as illustration provenance', () => {
    expect(
      isGeneratedIllustrationUrl(
        'gen_img_1',
        '/api/classroom-media/classroom-1/media/gen_img_1.png',
      ),
    ).toBe(true);
    expect(
      isGeneratedIllustrationUrl(
        'gen_img_1',
        '/api/classroom-media/classroom-1/media/source-img_1.png',
      ),
    ).toBe(false);
  });
});
