import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  isProviderKeyRequired: vi.fn(),
  generateSceneOutlinesFromRequirements: vi.fn(),
  applyOutlineFallbacks: vi.fn(),
  extractRequestedSceneCount: vi.fn(),
  isSceneCountMismatch: vi.fn(),
  generateSceneContent: vi.fn(),
  generateSceneActions: vi.fn(),
  createSceneWithActions: vi.fn(),
  persistClassroom: vi.fn(),
  persistGeneratedCourse: vi.fn(),
  callLLM: vi.fn(),
  generateMediaForClassroom: vi.fn(),
  removeUnresolvedMediaPlaceholders: vi.fn(),
  replaceMediaPlaceholders: vi.fn(),
  generateTTSForClassroom: vi.fn(),
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
  extractRequestedSceneCount: mocks.extractRequestedSceneCount,
  isSceneCountMismatch: mocks.isSceneCountMismatch,
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

vi.mock('@/lib/server/classroom-media-generation', () => ({
  generateMediaForClassroom: mocks.generateMediaForClassroom,
  removeUnresolvedMediaPlaceholders: mocks.removeUnresolvedMediaPlaceholders,
  replaceMediaPlaceholders: mocks.replaceMediaPlaceholders,
  generateTTSForClassroom: mocks.generateTTSForClassroom,
}));

vi.mock('@/lib/flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
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
  title: 'Retry Basics',
  description: 'Explain retries',
  keyPoints: ['Retry transient failures'],
  order: 1,
} as const;

const slideContent = {
  elements: [],
  remark: 'Retry transient failures',
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
  const progress: Array<{ message: string }> = [];
  const { generateClassroom } = await import('@/lib/server/classroom-generation');
  const result = await generateClassroom(
    {
      orgId: 'org-1',
      authorRole: 'author',
      learningApproach: 'andragogy',
      interactionLevel: 'balanced',
      requirement: 'Teach retry basics',
      ...input,
    },
    {
      baseUrl: 'http://localhost',
      ownerId: 'owner-1',
      onProgress: (event) => {
        progress.push({ message: event.message });
      },
    },
  );
  return { result, progress };
}

describe('classroom scene generation retries', () => {
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
    mocks.extractRequestedSceneCount.mockReturnValue(undefined);
    mocks.isSceneCountMismatch.mockReturnValue(false);
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use English.',
        outlines: [outline],
      },
    });
    mocks.applyOutlineFallbacks.mockImplementation((value) => value);
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
    mocks.generateTTSForClassroom.mockResolvedValue({ requested: 0, generated: 0 });
  });

  it('feeds exact validation feedback into the next scene content attempt', async () => {
    mocks.generateSceneContent
      .mockImplementationOnce(async (_outline, _aiCall, options) => {
        options.onValidationFailure('Move the title fully inside the slide.');
        return null;
      })
      .mockResolvedValueOnce(slideContent);

    const { result, progress } = await generateWithProgress();

    expect(result.scenesCount).toBe(1);
    expect(mocks.generateSceneContent).toHaveBeenCalledTimes(2);
    expect(mocks.generateSceneContent.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        validationDirective: 'Move the title fully inside the slide.',
      }),
    );
    expect(progress.some((event) => event.message.includes('Retrying scene 1/1 content'))).toBe(
      true,
    );
  });

  it('rejects an approved plan that violates the explicit author scene count', async () => {
    mocks.extractRequestedSceneCount.mockReturnValue(2);

    await expect(
      generateWithProgress({
        requirement: 'Create exactly 2 slides.',
        approvedPlan: {
          languageDirective: 'Use English.',
          outlines: [outline],
        },
      }),
    ).rejects.toThrow(
      'The approved classroom plan contains 1 scene, but the author explicitly requested 2.',
    );
    expect(mocks.generateSceneContent).not.toHaveBeenCalled();
  });

  it('fails instead of silently skipping any required scene', async () => {
    vi.useFakeTimers();
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use English.',
        outlines: [
          {
            ...outline,
            generatedResources: [
              {
                id: 'resource-1',
                format: 'xlsx',
                title: 'Cash flow workbook',
                fileName: 'cash-flow.xlsx',
                downloadUrl: '/r/classroom-1/resource-1/cash-flow.xlsx',
                qrImageUrl: '/api/classroom-media/classroom-1/resources/resource-1-qr.png',
              },
            ],
          },
        ],
      },
    });
    mocks.generateSceneContent.mockResolvedValue(null);

    const rejection = expect(generateWithProgress()).rejects.toThrow(
      'Required scene generation failed: Retry Basics',
    );
    try {
      await vi.runAllTimersAsync();
      await rejection;
      expect(mocks.persistClassroom).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails instead of persisting when scene creation returns no scene id', async () => {
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.createSceneWithActions.mockReturnValue(null);

    await expect(generateWithProgress()).rejects.toThrow(
      'Required scene creation failed: Retry Basics',
    );
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('forwards classroom thinking config to scene retry LLM calls', async () => {
    const thinkingConfig = { enabled: true, effort: 'high' };
    mocks.resolveModel.mockResolvedValue({
      model: { id: 'language-model' },
      modelInfo: {},
      modelString: 'test:model',
      providerId: 'test',
      apiKey: '',
      thinkingConfig,
    });
    mocks.generateSceneContent.mockImplementation(async (_outline, aiCall) => {
      await aiCall('system', 'user');
      return slideContent;
    });

    await generateWithProgress();

    expect(mocks.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
      'generate-classroom-scene',
      undefined,
      thinkingConfig,
    );
  });

  it('forwards the resolved language model and requirements to scene content generation', async () => {
    const languageModel = { id: 'pbl-language-model' };
    const thinkingConfig = { enabled: true, effort: 'high' };
    mocks.resolveModel.mockResolvedValue({
      model: languageModel,
      modelInfo: {},
      modelString: 'test:model',
      providerId: 'test',
      apiKey: '',
      thinkingConfig,
    });
    mocks.generateSceneContent.mockResolvedValue(slideContent);

    await generateWithProgress();

    expect(mocks.generateSceneContent).toHaveBeenCalledWith(
      outline,
      expect.any(Function),
      expect.objectContaining({
        languageModel,
        thinkingConfig,
        userRequirements: expect.objectContaining({
          requirement: expect.stringContaining(
            'Instructional approach: andragogy. Learner stage: adult-professional.',
          ),
        }),
      }),
    );
  });

  it('retries retryable action generation errors', async () => {
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.generateSceneActions
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValueOnce(completeRosterActions);

    const { result, progress } = await generateWithProgress();

    expect(result.scenesCount).toBe(1);
    expect(mocks.generateSceneActions).toHaveBeenCalledTimes(2);
    expect(progress.some((event) => event.message.includes('Retrying scene 1/1 actions'))).toBe(
      true,
    );
  });

  it('does not retry non-retryable action generation errors', async () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.generateSceneActions.mockRejectedValue(unauthorized);

    await expect(generateWithProgress()).rejects.toBe(unauthorized);

    expect(mocks.generateSceneActions).toHaveBeenCalledTimes(1);
  });

  it('fails the classroom job when requested narration was not persisted', async () => {
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.generateSceneActions.mockResolvedValue([...completeRosterActions]);
    mocks.generateTTSForClassroom.mockResolvedValue({ requested: 1, generated: 0 });

    await expect(generateWithProgress({ enableTTS: true })).rejects.toThrow(
      'TTS persistence incomplete: 0/1 speech actions generated',
    );
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('fails instead of persisting when enabled image generation produces no file', async () => {
    const imageOutline = {
      ...outline,
      mediaGenerations: [
        {
          type: 'image' as const,
          prompt: 'A clear visual explanation of retry backoff',
          elementId: 'gen_img_retry',
          aspectRatio: '16:9',
        },
      ],
    };
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use English.',
        outlines: [imageOutline],
      },
    });
    mocks.generateSceneContent.mockResolvedValue({
      elements: [
        {
          id: 'image-1',
          type: 'image',
          src: 'gen_img_retry',
        },
      ],
      remark: 'Retry transient failures',
    });
    mocks.generateMediaForClassroom.mockResolvedValue({});

    await expect(generateWithProgress({ enableImageGeneration: true })).rejects.toThrow(
      'Enabled media generation produced 0/1 requested files',
    );
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('fails when a generated image file is not integrated into any scene', async () => {
    const imageOutline = {
      ...outline,
      mediaGenerations: [
        {
          type: 'image' as const,
          prompt: 'A clear visual explanation of retry backoff',
          elementId: 'gen_img_orphan',
          aspectRatio: '16:9',
        },
      ],
    };
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: { languageDirective: 'Use English.', outlines: [imageOutline] },
    });
    mocks.generateSceneContent.mockResolvedValue(slideContent);
    mocks.generateMediaForClassroom.mockResolvedValue({
      gen_img_orphan: '/api/classroom-media/classroom-1/media/gen_img_orphan.png',
    });

    await expect(generateWithProgress({ enableImageGeneration: true })).rejects.toThrow(
      'Media integration incomplete: gen_img_orphan',
    );
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('converts a PDF image suggestion into an original illustration without assigning the source', async () => {
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use English.',
        outlines: [{ ...outline, suggestedImageIds: ['img_pdf_1'] }],
      },
    });
    mocks.generateSceneContent.mockResolvedValue({
      elements: [
        {
          id: 'image-1',
          type: 'image',
          src: 'gen_img_original_outline-1',
        },
      ],
      remark: 'Retry transient failures',
    });
    mocks.generateMediaForClassroom.mockResolvedValue({
      'gen_img_original_outline-1':
        '/api/classroom-media/classroom-1/media/gen_img_original_outline-1.png',
    });
    mocks.replaceMediaPlaceholders.mockImplementation((scenes) => {
      scenes[0].content.canvas.elements[0].src =
        '/api/classroom-media/classroom-1/media/gen_img_original_outline-1.png';
    });

    const { result } = await generateWithProgress({
      enableImageGeneration: true,
      pdfSource: {
        text: 'Retry source document',
        images: [
          {
            id: 'img_pdf_1',
            src: 'data:image/png;base64,c291cmNl',
            pageNumber: 1,
          },
        ],
      },
    });

    expect(result.scenesCount).toBe(1);
    const normalizedOutline = mocks.generateMediaForClassroom.mock.calls[0]?.[0]?.[0];
    expect(normalizedOutline).toEqual(
      expect.objectContaining({
        mediaGenerations: [
          expect.objectContaining({
            type: 'image',
            elementId: 'gen_img_original_outline-1',
            prompt: expect.stringContaining('Do not reproduce, trace, imitate, or reuse'),
          }),
        ],
      }),
    );
    expect(normalizedOutline).not.toHaveProperty('suggestedImageIds');
    const sceneOptions = mocks.generateSceneContent.mock.calls[0]?.[2];
    expect(sceneOptions).not.toHaveProperty('requiredSourceImageIds');
    expect(sceneOptions?.assignedImages ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'img_pdf_1' })]),
    );
  });

  it('rejects a source-media URL returned for a generated illustration', async () => {
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: {
        languageDirective: 'Use English.',
        outlines: [
          {
            ...outline,
            mediaGenerations: [
              {
                type: 'image',
                prompt: 'Illustrate retry backoff.',
                elementId: 'gen_img_retry',
                aspectRatio: '16:9',
              },
            ],
          },
        ],
      },
    });
    mocks.generateSceneContent.mockResolvedValue({
      elements: [{ id: 'image-1', type: 'image', src: 'gen_img_retry' }],
      remark: 'Retry transient failures',
    });
    mocks.generateMediaForClassroom.mockResolvedValue({
      gen_img_retry: '/api/classroom-media/classroom-1/media/source-img_pdf_1.png',
    });

    await expect(generateWithProgress({ enableImageGeneration: true })).rejects.toThrow(
      'Generated illustration provenance invalid: gen_img_retry',
    );
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });
});
