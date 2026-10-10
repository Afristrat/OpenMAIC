import { describe, expect, it, vi } from 'vitest';
import {
  assertSourceMaterialAlignment,
  SourceMaterialConflictError,
} from '@/lib/server/source-material-alignment';

const REQUEST =
  'Formation de 3h30 pour ingénieurs sceptiques sur la reconnaissance, l’appréciation et la gratitude, avec le cadre TAPS, McKinsey 2021 et Gallup 2024.';
const SOURCE =
  'Webinaire d’une heure pour un public mixte sur la gratitude au travail et la sécurité psychologique selon Amy Edmondson.';

const alignedVerdict = JSON.stringify({
  status: 'aligned',
  requestTopic: 'Gratitude et reconnaissance au travail',
  sourceTopic: 'Gratitude et sécurité psychologique au travail',
  explanation: 'Même sujet, public et durée adaptés.',
  suggestedRequirement: '',
  references: [],
});

describe('assertSourceMaterialAlignment', () => {
  it('transmet au juge la règle d’adaptation (public, durée, ton) et la demande intégrale', async () => {
    const aiCall = vi.fn().mockResolvedValue(alignedVerdict);

    await expect(assertSourceMaterialAlignment(REQUEST, SOURCE, aiCall, 'fr-FR')).resolves.toBe(
      undefined,
    );

    const [system, user] = aiCall.mock.calls[0] as [string, string];
    expect(system).toContain('NEVER a conflict');
    expect(system).toContain('different audience, duration');
    expect(system).toContain('primary SUBJECT MATTER');
    expect(JSON.parse(user).authorRequest).toBe(REQUEST);
  });

  it('accepte une source plus courte et grand public pour une formation plus longue et technique', async () => {
    const aiCall = vi.fn().mockResolvedValue(alignedVerdict);
    await expect(
      assertSourceMaterialAlignment(REQUEST, SOURCE, aiCall, 'fr-FR'),
    ).resolves.toBeUndefined();
    expect(aiCall).toHaveBeenCalledTimes(1);
  });

  it('bloque toujours quand le sujet principal diffère réellement', async () => {
    const reference = 'Webinaire d’une heure pour un public mixte';
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        status: 'conflicting',
        requestTopic: 'Cybersécurité industrielle',
        sourceTopic: 'Gratitude au travail',
        explanation: 'Les sujets principaux sont sans rapport.',
        suggestedRequirement: 'Créer un webinaire sur la gratitude au travail.',
        references: [reference],
      }),
    );

    await expect(
      assertSourceMaterialAlignment('Formation sur la cybersécurité industrielle.', SOURCE, aiCall),
    ).rejects.toBeInstanceOf(SourceMaterialConflictError);
  });

  it('garde un échantillon assez large pour couvrir plusieurs documents joints', async () => {
    const aiCall = vi.fn().mockResolvedValue(alignedVerdict);
    const longSource = `${'a'.repeat(25_000)} ${'b'.repeat(8_000)} ${'c'.repeat(8_000)}`;

    await assertSourceMaterialAlignment(REQUEST, longSource, aiCall, 'fr-FR');

    const sample = JSON.parse((aiCall.mock.calls[0] as [string, string])[1]).attachedSourceSample;
    expect(sample).toContain('b'.repeat(8_000));
    expect(sample).toContain('c'.repeat(8_000));
  });
});
