import { describe, expect, it } from 'vitest';

import { buildProgressiveFraming } from '@/lib/formation-engine/progressive-framing';
import { compileGenerationPlan } from '@/lib/formation-engine/prompt-compiler';

const baseContext = {
  locale: 'fr-FR' as const,
  requestedCapabilities: ['chat' as const],
};

const requiredExplicit = [
  {
    field: 'transformation.problem' as const,
    origin: 'explicit' as const,
    value: 'Erreurs de qualification',
  },
  {
    field: 'transformation.targetPerformance' as const,
    origin: 'explicit' as const,
    value: 'Qualifier un dossier sans omission',
  },
  {
    field: 'audience.experience' as const,
    origin: 'explicit' as const,
    value: 'Conseillers débutants',
  },
  { field: 'audience.language' as const, origin: 'explicit' as const, value: 'fr-FR' },
  { field: 'delivery.duration' as const, origin: 'explicit' as const, value: '4 heures' },
  {
    field: 'assessment.successEvidence' as const,
    origin: 'explicit' as const,
    value: 'Dossier réel validé',
  },
];

describe('progressive framing contract', () => {
  it('accepts explicit values and records only sufficiently supported inferences as assumptions', () => {
    const result = buildProgressiveFraming(
      [
        ...requiredExplicit,
        {
          field: 'audience.culturalContext',
          origin: 'inferred',
          value: 'Maroc',
          evidence: 'Organisation rattachée au tenant marocain',
          confidence: 0.9,
        },
      ],
      baseContext,
    );

    expect(result.blockingQuestions).toEqual([]);
    expect(result.assumptions).toEqual([
      expect.objectContaining({ field: 'audience.culturalContext', confidence: 0.9 }),
    ]);
    expect(result.contract['audience.culturalContext']).toBe('Maroc');
  });

  it('asks only context-changing unknowns and leaves optional unknowns non-blocking', () => {
    const result = buildProgressiveFraming(requiredExplicit, {
      ...baseContext,
      requestedCapabilities: ['video-generation'],
      sourceMaterialProvided: true,
      externalSharing: true,
    });

    expect(result.blockingQuestions.map((question) => question.field)).toEqual([
      'audience.accessibility',
      'delivery.infrastructure',
      'content.authorizedSources',
      'operation.confidentiality',
    ]);
    expect(result.unknownNonBlocking).toContain('audience.culturalContext');
    expect(result.unknownNonBlocking).toContain('delivery.groupSize');
  });

  it('turns a low-confidence inference back into a blocking question', () => {
    const result = buildProgressiveFraming(
      [
        ...requiredExplicit.filter((observation) => observation.field !== 'audience.language'),
        {
          field: 'audience.language',
          origin: 'inferred',
          value: 'fr-FR',
          evidence: 'Langue de l’interface',
          confidence: 0.55,
        },
      ],
      baseContext,
    );

    expect(result.contract['audience.language']).toBeUndefined();
    expect(result.blockingQuestions.map((question) => question.field)).toContain(
      'audience.language',
    );
  });

  it('rejects unsupported or invalid inference metadata', () => {
    expect(() =>
      buildProgressiveFraming(
        [
          {
            field: 'audience.language',
            origin: 'inferred',
            value: 'fr-FR',
            evidence: '',
            confidence: 0.8,
          },
        ],
        baseContext,
      ),
    ).toThrow('Missing evidence');
  });

  it('makes the compiled plan request input while preserving traceable assumptions', () => {
    const framing = buildProgressiveFraming(
      [
        ...requiredExplicit.filter((observation) => observation.field !== 'delivery.duration'),
        {
          field: 'audience.culturalContext',
          origin: 'inferred',
          value: 'Afrique du Nord',
          evidence: 'Périmètre explicite de l’organisation',
          confidence: 0.86,
        },
      ],
      baseContext,
    );
    const plan = compileGenerationPlan({
      contract: { requirement: 'Concevoir la formation' },
      framing,
      tasks: [],
      certifications: [],
    });

    expect(plan.status).toBe('needs_input');
    expect(plan.blockingQuestions).toHaveLength(1);
    expect(plan.assumptions[0]).toMatchObject({
      field: 'audience.culturalContext',
      confidence: 0.86,
    });
  });
});
