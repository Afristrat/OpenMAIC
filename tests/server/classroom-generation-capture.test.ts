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

async function generateWithProgress() {
  const { generateClassroom } = await import('@/lib/server/classroom-generation');
  return generateClassroom(
    {
      orgId: 'org-1',
      authorRole: 'author',
      learningApproach: 'andragogy',
      interactionLevel: 'balanced',
      requirement: 'Configurer LiteLLM',
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
    mocks.generateSceneActions.mockResolvedValue([]);
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
});
