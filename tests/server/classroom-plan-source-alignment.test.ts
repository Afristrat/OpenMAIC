import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: mocks.callLLM,
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/ai/providers', () => ({
  isProviderKeyRequired: vi.fn(() => false),
}));

vi.mock('@/lib/flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/server/skill-resolution', () => ({
  resolveOrganizationSkillId: vi.fn(async (_orgId: string, skillId: string) => skillId),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { settings: null } }),
        })),
      })),
    })),
  })),
}));

import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';

const input = {
  orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
  authorRole: 'author' as const,
  requirement:
    'Créer exactement cinq diapositives sur la gestion du temps, la matrice d’Eisenhower et la gestion des distractions.',
  language: 'fr-FR' as const,
  learningApproach: 'andragogy' as const,
  interactionLevel: 'balanced' as const,
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
  pdfContent: {
    text: 'Process Improvement Strategies. Root cause analysis, Lean Six Sigma, Kaizen, process mapping and continuous improvement.',
    images: [],
  },
};

const generatedPlan = JSON.stringify({
  languageDirective: 'Former en français.',
  courseTitle: 'Gestion du temps',
  syllabus: {
    audience: 'À préciser par l’auteur',
    prerequisites: 'À préciser par l’auteur',
    overallObjective: 'Organiser son temps.',
    learningObjectives: ['Prioriser ses tâches.'],
    totalDurationMinutes: 15,
    deliveryMode: 'Formation autonome',
    assessmentStrategy: 'Question de réflexion',
    expectedDeliverable: 'Plan d’action',
  },
  outlines: [
    {
      id: 'scene-1',
      type: 'slide',
      title: 'Prioriser',
      description: 'Utiliser la matrice d’Eisenhower.',
      keyPoints: ['Urgent', 'Important'],
      order: 1,
    },
  ],
});

describe('classroom plan source alignment gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModel.mockResolvedValue({
      providerId: 'test-provider',
      model: {},
      apiKey: 'test-key',
      modelInfo: { outputWindow: 4096 },
      thinkingConfig: undefined,
    });
    mocks.callLLM.mockImplementation(
      async ({ messages }: { messages?: Array<{ content: string }> }) => {
        const system = messages?.[0]?.content ?? '';
        if (system.includes('SOURCE ALIGNMENT GATE')) {
          return {
            text: JSON.stringify({
              status: 'conflicting',
              requestTopic: 'Gestion du temps',
              sourceTopic: 'Amélioration des processus',
              explanation:
                'La demande porte sur la gestion individuelle du temps, tandis que le document traite de méthodes d’amélioration des processus.',
              suggestedRequirement:
                'Créer exactement cinq diapositives sur l’analyse des causes racines, Lean Six Sigma et l’amélioration continue.',
              references: ['Root cause analysis, Lean Six Sigma'],
            }),
          };
        }
        return { text: generatedPlan };
      },
    );
  });

  test('refuses to generate a syllabus when the request and attached source conflict', async () => {
    await expect(generateClassroomPlan(input)).rejects.toMatchObject({
      name: 'SourceMaterialConflictError',
      alignment: {
        status: 'conflicting',
        requestTopic: 'Gestion du temps',
        sourceTopic: 'Amélioration des processus',
        suggestedRequirement:
          'Créer exactement cinq diapositives sur l’analyse des causes racines, Lean Six Sigma et l’amélioration continue.',
        references: ['Root cause analysis, Lean Six Sigma'],
      },
    });

    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    const alignmentCall = mocks.callLLM.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(alignmentCall.messages[0]?.content).toContain('exact, verbatim excerpts');
    expect(alignmentCall.messages[1]?.content).toContain('"authorLocale":"fr-FR"');
    expect(alignmentCall.messages[1]?.content).toContain('Root cause analysis');
    expect(alignmentCall.messages[1]?.content).not.toContain('process-improvement.pdf');
  });

  test('continues to the syllabus only when the source and request are aligned', async () => {
    mocks.callLLM.mockImplementation(
      async ({ messages }: { messages?: Array<{ content: string }> }) => {
        const system = messages?.[0]?.content ?? '';
        if (system.includes('SOURCE ALIGNMENT GATE')) {
          return {
            text: JSON.stringify({
              status: 'aligned',
              requestTopic: 'Amélioration des processus',
              sourceTopic: 'Amélioration des processus',
              explanation: 'Le document étaye directement la demande.',
              suggestedRequirement: '',
              references: [],
            }),
          };
        }
        return { text: generatedPlan };
      },
    );

    const result = await generateClassroomPlan({
      ...input,
      requirement: 'Créer une formation sur l’amélioration continue et Lean Six Sigma.',
    });

    expect(result.courseTitle).toBe('Gestion du temps');
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  test('retries one malformed alignment response without weakening a valid verdict', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({ text: 'Réponse momentanément inexploitable' })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          status: 'aligned',
          requestTopic: 'Amélioration des processus',
          sourceTopic: 'Amélioration des processus',
          explanation: 'Le document étaye directement la demande.',
          suggestedRequirement: '',
          references: [],
        }),
      })
      .mockResolvedValueOnce({ text: generatedPlan });

    await generateClassroomPlan({
      ...input,
      requirement: 'Créer une formation sur l’amélioration continue et Lean Six Sigma.',
    });

    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
    const retryMessages = mocks.callLLM.mock.calls[1]?.[0]?.messages as Array<{
      content: string;
    }>;
    expect(retryMessages[0]?.content).toContain('This is the only retry');
  });

  test('does not retry a structurally valid uncertain verdict', async () => {
    mocks.callLLM.mockResolvedValueOnce({
      text: JSON.stringify({
        status: 'uncertain',
        requestTopic: 'Gestion opérationnelle',
        sourceTopic: 'Amélioration des processus',
        explanation: 'La portée de la demande reste ambiguë.',
        suggestedRequirement:
          'Créer une formation sur l’analyse des causes racines et l’amélioration continue.',
        references: ['Root cause analysis, Lean Six Sigma'],
      }),
    });

    await expect(generateClassroomPlan(input)).rejects.toMatchObject({
      name: 'SourceMaterialConflictError',
      alignment: { status: 'uncertain' },
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });

  test('fails closed after two malformed alignment responses', async () => {
    mocks.callLLM.mockResolvedValue({ text: 'Réponse momentanément inexploitable' });

    await expect(generateClassroomPlan(input)).rejects.toMatchObject({
      name: 'SourceMaterialConflictError',
      alignment: {
        status: 'uncertain',
        requestTopic: 'Demande non déterminée',
        sourceTopic: 'Document non déterminé',
      },
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  test('rejects a document without usable text without inventing a topic from metadata', async () => {
    await expect(
      generateClassroomPlan({
        ...input,
        language: 'en-US',
        pdfContent: { text: '   ', images: [] },
      }),
    ).rejects.toMatchObject({
      name: 'SourceMaterialConflictError',
      alignment: {
        status: 'uncertain',
        sourceTopic: 'No usable content',
        references: [],
      },
    });

    expect(mocks.callLLM).not.toHaveBeenCalled();
  });
});
