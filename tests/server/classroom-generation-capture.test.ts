import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  isProviderKeyRequired: vi.fn(),
  generateSceneOutlinesFromRequirements: vi.fn(),
  applyOutlineFallbacks: vi.fn(),
  generateSceneContent: vi.fn(),
  generateSceneActions: vi.fn(),
  createSceneWithActions: vi.fn(),
  persistClassroom: vi.fn(),
  persistGeneratedCourse: vi.fn(),
  callLLM: vi.fn(),
  decideCaptureForScene: vi.fn(),
  requestWebCapture: vi.fn(),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/ai/providers', () => ({
  isProviderKeyRequired: mocks.isProviderKeyRequired,
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: mocks.callLLM,
}));

vi.mock('@/lib/generation/outline-generator', () => ({
  generateSceneOutlinesFromRequirements: mocks.generateSceneOutlinesFromRequirements,
  applyOutlineFallbacks: mocks.applyOutlineFallbacks,
}));

vi.mock('@/lib/generation/scene-generator', () => ({
  generateSceneContent: mocks.generateSceneContent,
  generateSceneActions: mocks.generateSceneActions,
  createSceneWithActions: mocks.createSceneWithActions,
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  persistClassroom: mocks.persistClassroom,
}));

vi.mock('@/lib/server/course-storage', () => ({
  persistGeneratedCourse: mocks.persistGeneratedCourse,
}));

vi.mock('@/lib/generation/web-capture-plan', () => ({
  decideCaptureForScene: mocks.decideCaptureForScene,
}));

vi.mock('@/lib/server/capture-client', () => ({
  requestWebCapture: mocks.requestWebCapture,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const outline = {
  id: 'outline-1',
  type: 'slide',
  title: 'Configurer les clés virtuelles LiteLLM',
  description: 'Montrer comment créer une clé virtuelle dans le panel admin LiteLLM.',
  keyPoints: ['Panel /ui'],
  order: 1,
} as const;

const slideContent = {
  elements: [],
  remark: 'Panel /ui',
};

const completeRosterActions = [
  {
    id: 'speech-teacher',
    type: 'speech',
    text: 'Teacher narration.',
    agentId: 'persona-professor',
  },
  {
    id: 'speech-assistant',
    type: 'speech',
    text: 'Assistant contribution.',
    agentId: 'persona-teaching-assistant',
  },
  { id: 'speech-joker', type: 'speech', text: 'Useful humor.', agentId: 'persona-joker' },
  { id: 'speech-curious', type: 'speech', text: 'Useful question.', agentId: 'persona-curious' },
] as const;

async function generateWithProgress(input: Record<string, unknown> = {}) {
  const { generateClassroom } = await import('@/lib/server/classroom-generation');
  return generateClassroom(
    {
      orgId: 'org-1',
      authorRole: 'author',
      learningApproach: 'andragogy',
      interactionLevel: 'balanced',
      requirement: 'Configurer LiteLLM',
      ...input,
    },
    { baseUrl: 'http://localhost', ownerId: 'owner-1' },
  );
}

describe('classroom generation — web capture injection', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.resolveModel.mockResolvedValue({
      model: { id: 'language-model' },
      modelInfo: {},
      modelString: 'test:model',
      providerId: 'test',
      apiKey: '',
    });
    mocks.isProviderKeyRequired.mockReturnValue(false);
    mocks.callLLM.mockResolvedValue({ text: 'ok' });
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use French.',
        outlines: [outline],
      },
    });
    mocks.applyOutlineFallbacks.mockImplementation((value) => value);
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.generateSceneActions.mockResolvedValue(completeRosterActions);
    mocks.createSceneWithActions.mockImplementation((sceneOutline, content, actions, api) => {
      const sceneResult = api.scene.create({
        type: sceneOutline.type,
        title: sceneOutline.title,
        order: sceneOutline.order,
        content: {
          type: 'slide',
          canvas: {
            id: 'slide-1',
            viewportSize: 1000,
            viewportRatio: 0.5625,
            elements: content.elements,
          },
        },
        actions,
      });
      return sceneResult.success ? (sceneResult.data ?? null) : null;
    });
    mocks.persistClassroom.mockImplementation(async ({ id, scenes }) => ({
      id,
      url: `http://localhost/classroom/${id}`,
      scenesCount: scenes.length,
      createdAt: '2026-06-22T00:00:00.000Z',
    }));
    mocks.persistGeneratedCourse.mockResolvedValue('course-1');
    mocks.decideCaptureForScene.mockResolvedValue(null);
    mocks.requestWebCapture.mockResolvedValue(null);
  });

  it('injects a captured image into assignedImages before generating slide content', async () => {
    mocks.decideCaptureForScene.mockResolvedValue({
      needsCapture: true,
      url: 'https://proxy.ai-mpower.com/ui',
      interactionSteps: [],
      format: 'image',
      reason: 'ok',
    });
    mocks.requestWebCapture.mockResolvedValue({
      assetUrl: '/api/classroom-media/classroom_1/media/capture_1.png',
      format: 'image',
    });

    await generateWithProgress();

    expect(mocks.requestWebCapture).toHaveBeenCalledWith(
      expect.objectContaining({ needsCapture: true }),
      expect.any(String),
    );
    const optionsArg = mocks.generateSceneContent.mock.calls[0][2];
    expect(optionsArg.assignedImages).toEqual([
      expect.objectContaining({ src: '/api/classroom-media/classroom_1/media/capture_1.png' }),
    ]);
    expect(optionsArg.imageMapping).toEqual({
      img_capture_1: '/api/classroom-media/classroom_1/media/capture_1.png',
    });
  });

  it('does not call requestWebCapture when decideCaptureForScene says needsCapture:false', async () => {
    mocks.decideCaptureForScene.mockResolvedValue({
      needsCapture: false,
      url: '',
      interactionSteps: [],
      format: 'image',
      reason: 'Scène conceptuelle',
    });

    await generateWithProgress();

    expect(mocks.requestWebCapture).not.toHaveBeenCalled();
    const optionsArg = mocks.generateSceneContent.mock.calls[0][2];
    expect(optionsArg.assignedImages).toBeUndefined();
  });

  it('persists the animation constitution when the author uses the preset roster', async () => {
    await generateWithProgress();

    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        animationConstitution: expect.objectContaining({
          approach: 'andragogy',
          interactionLevel: 'balanced',
          agentRosterSnapshot: expect.arrayContaining([
            expect.objectContaining({
              enabled: true,
              identityCompatibility: 'validated',
            }),
          ]),
        }),
      }),
      'http://localhost',
    );
  });

  it('keeps every explicitly selected contextual specialist in the preset roster', async () => {
    const specialist = {
      id: 'specialist-Ab12Cd34',
      name: 'Nadia',
      occupationTitle: 'comptable',
      iscoCode: '2411',
      escoUri: 'http://data.europa.eu/esco/occupation/accountant',
      reason: 'Relier les exercices aux décisions financières.',
      gender: 'female' as const,
      avatar: '/avatars/assist.png',
      role: 'assistant' as const,
      persona: 'Spécialiste fondée sur les tâches ISCO-08.',
      occupationalProfile: {
        standard: 'ISCO-08' as const,
        unitGroupCode: '2411',
        unitGroupTitle: 'Cadres comptables',
        occupationDescription: 'Analyse les documents financiers.',
        tasks: ['préparer et certifier les états financiers'],
        sourceTasks: ['prepare and certify financial statements'],
        taskLocale: 'fr-FR' as const,
        sourceVersion: 'v1.2.1' as const,
        essentialSkills: ['analyser le risque financier'],
        knowledge: ['techniques comptables'],
        iscoUri: 'http://data.europa.eu/esco/isco/C2411',
        occupationUri: 'http://data.europa.eu/esco/occupation/accountant',
        sourceUrl: 'https://esco.ec.europa.eu/en/classification/occupation_main',
      },
      voiceConfig: { providerId: 'higgs-tts' as const, voiceId: 'hanae' },
    };
    mocks.generateSceneActions.mockResolvedValue([
      ...completeRosterActions.filter((action) => action.agentId !== 'persona-teaching-assistant'),
      {
        id: 'speech-specialist',
        type: 'speech',
        text: 'Vérifions ce budget avec une pratique comptable réelle.',
        agentId: specialist.id,
      },
    ]);

    await generateWithProgress({
      agentMode: 'default',
      selectedPersonaIds: ['joker', 'curious'],
      contextualSpecialists: [specialist],
    });

    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: expect.objectContaining({
          generatedAgentConfigs: expect.arrayContaining([
            expect.objectContaining({
              id: specialist.id,
              occupationalProfile: specialist.occupationalProfile,
            }),
          ]),
        }),
      }),
      'http://localhost',
    );
  });

  it('never blocks scene generation when requestWebCapture returns null (capture failed)', async () => {
    mocks.decideCaptureForScene.mockResolvedValue({
      needsCapture: true,
      url: 'https://proxy.ai-mpower.com/ui',
      interactionSteps: [],
      format: 'image',
      reason: 'ok',
    });
    mocks.requestWebCapture.mockResolvedValue(null);

    const result = await generateWithProgress();

    expect(result.scenesCount).toBe(1);
    const optionsArg = mocks.generateSceneContent.mock.calls[0][2];
    expect(optionsArg.assignedImages).toBeUndefined();
  });

  it('uses the syllabus approved by the author without regenerating another outline', async () => {
    const approvedOutline = {
      ...outline,
      id: 'approved-outline',
      title: 'Plan validé par l’auteur',
      order: 1,
    };

    await generateWithProgress({
      approvedPlan: {
        courseTitle: 'Formation validée',
        languageDirective: 'Répondre en français.',
        syllabus: {
          audience: 'Responsables opérationnels',
          prerequisites: 'Aucun prérequis',
          overallObjective: 'Appliquer la méthode présentée.',
          learningObjectives: ['Mettre en œuvre la méthode.'],
          totalDurationMinutes: 15,
          deliveryMode: 'Classe virtuelle interactive',
          assessmentStrategy: 'Mise en situation observée',
          expectedDeliverable: 'Plan d’action individuel',
        },
        outlines: [approvedOutline],
      },
    });

    expect(mocks.generateSceneOutlinesFromRequirements).not.toHaveBeenCalled();
    expect(mocks.generateSceneContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approved-outline', title: 'Plan validé par l’auteur' }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({ stage: expect.objectContaining({ name: 'Formation validée' }) }),
      'http://localhost',
    );
  });

  it('uses the approved learning objective for animation even when the source brief is long', async () => {
    const overallObjective = 'Appliquer une méthode d’amélioration à un processus réel.';

    await generateWithProgress({
      requirement: 'Brief source détaillé. '.repeat(220),
      approvedPlan: {
        courseTitle: 'Amélioration des processus',
        languageDirective: 'Répondre en français.',
        syllabus: {
          audience: 'Responsables opérationnels',
          prerequisites: 'Aucun prérequis',
          overallObjective,
          learningObjectives: ['Diagnostiquer puis améliorer un processus.'],
          totalDurationMinutes: 15,
          deliveryMode: 'Classe virtuelle interactive',
          assessmentStrategy: 'Mise en situation observée',
          expectedDeliverable: 'Plan d’action individuel',
        },
        outlines: [outline],
      },
    });

    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        animationConstitution: expect.objectContaining({
          learningIntent: expect.objectContaining({ targetPerformance: overallObjective }),
        }),
      }),
      'http://localhost',
    );
  });

  it('keeps legacy plans without a syllabus compatible with the animation contract', async () => {
    await generateWithProgress();

    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        animationConstitution: expect.objectContaining({
          learningIntent: expect.objectContaining({
            targetPerformance: 'Configurer les clés virtuelles LiteLLM',
          }),
        }),
      }),
      'http://localhost',
    );
  });
});
