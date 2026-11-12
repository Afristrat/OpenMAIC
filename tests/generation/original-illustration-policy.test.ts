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

  it('écrit la consigne d’originalité dans la langue du cours, jamais en anglais pour un cours français', () => {
    const french =
      'L’ensemble du cours est produit en français (fr-FR), avec une terminologie métier.';
    const [result] = enforceOriginalIllustrations(
      [
        {
          ...outline,
          mediaGenerations: [
            {
              type: 'image' as const,
              elementId: 'gen_img_1',
              prompt: 'Schéma du cycle de l’eau, flèches claires.',
            },
          ],
        },
      ],
      true,
      french,
    );
    const prompt = result.mediaGenerations?.[0]?.prompt ?? '';

    expect(prompt).toContain('Schéma du cycle de l’eau, flèches claires.');
    expect(prompt).toMatch(/illustration pédagogique originale/);
    expect(prompt).toMatch(/texte visible dans l’image est en français/);
    expect(prompt).not.toMatch(/Create a new original|Do not reproduce/);
  });

  it('écrit en arabe pour un cours arabe, avec le texte des images en arabe', () => {
    const [result] = enforceOriginalIllustrations(
      [{ ...outline, suggestedImageIds: ['img_pdf_1'] }],
      true,
      'يُقدَّم المحتوى كاملاً باللغة العربية (ar-MA).',
    );
    const prompt = result.mediaGenerations?.[0]?.prompt ?? '';

    expect(prompt).toMatch(/[؀-ۿ]/);
    expect(prompt).toMatch(/بالعربية/);
    expect(prompt).not.toMatch(/Create a new original|Illustrate the single/);
  });

  it('choisit la langue d’enseignement même quand la consigne cite une autre langue ensuite', () => {
    const [result] = enforceOriginalIllustrations(
      [{ ...outline, suggestedImageIds: ['img_pdf_1'] }],
      true,
      'Deliver the entire course in English. Keep French legal terms in French.',
    );

    expect(result.mediaGenerations?.[0]?.prompt).toMatch(/Create a new original/);
    expect(result.mediaGenerations?.[0]?.prompt).toMatch(
      /Any text visible in the image is in English/,
    );
  });

  it('remplace l’ancienne consigne anglaise d’un plan déjà enregistré par celle de la langue du cours, une seule fois', () => {
    const legacy = {
      type: 'image' as const,
      elementId: 'gen_img_1',
      prompt:
        'Create a new original explanatory illustration. Do not reproduce, trace, imitate, or reuse any image from the supplied documents. Schéma des flux.',
    };
    const french = 'Cours en français (fr-FR).';
    const [once] = enforceOriginalIllustrations(
      [{ ...outline, mediaGenerations: [legacy] }],
      true,
      french,
    );
    const [twice] = enforceOriginalIllustrations([once], true, french);

    expect(once.mediaGenerations?.[0]?.prompt).not.toMatch(/Create a new original/);
    expect(once.mediaGenerations?.[0]?.prompt).toContain('Schéma des flux.');
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
