import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/ai/providers', () => ({ isProviderKeyRequired: vi.fn(() => false) }));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(false) }));
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

import { extractRequestedSceneCount } from '@/lib/generation/outline-generator';
import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';

const input = {
  orgId: 'org-1',
  authorRole: 'author' as const,
  requirement: 'Produis exactement 12 séquences cohérentes sur l’amélioration des processus.',
  language: 'fr-FR' as const,
  learningApproach: 'andragogy' as const,
  interactionLevel: 'immersive' as const,
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
};

function planWithCount(count: number) {
  return JSON.stringify({
    languageDirective: 'Teach in French.',
    courseTitle: 'Process improvement',
    outlines: Array.from({ length: count }, (_, index) => ({
      id: `scene-${index + 1}`,
      type: 'slide',
      title: `Scene ${index + 1}`,
      description: `Complete scene ${index + 1}`,
      keyPoints: [`Point ${index + 1}`],
      order: index + 1,
    })),
  });
}

describe('explicit classroom scene count invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModel.mockResolvedValue({
      providerId: 'test-provider',
      model: {},
      apiKey: 'test-key',
      modelInfo: { outputWindow: 4096 },
      thinkingConfig: undefined,
    });
  });

  test.each([
    ['exactement cinq diapositives', 5],
    ['exactly twelve slides', 12],
    ['12 séquences cohérentes', 12],
    ['أنشئ ١٢ شريحة مترابطة', 12],
    ['session de 10 à 15 minutes', undefined],
  ])('extracts an explicit count from %s', (requirement, expected) => {
    expect(extractRequestedSceneCount(requirement)).toBe(expected);
  });

  test('regenerates the whole plan once when the model returns the wrong count', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({ text: planWithCount(15) })
      .mockResolvedValueOnce({ text: planWithCount(12) });

    const result = await generateClassroomPlan(input);

    expect(result.outlines).toHaveLength(12);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    const retryMessages = mocks.callLLM.mock.calls[1]?.[0]?.messages as Array<{ content: string }>;
    expect(retryMessages[1]?.content).toContain('Return exactly 12 complete');
    expect(retryMessages[1]?.content).toContain('Do not truncate');
  });

  test('fails explicitly after one corrective regeneration instead of showing a wrong plan', async () => {
    mocks.callLLM.mockResolvedValue({ text: planWithCount(15) });

    await expect(generateClassroomPlan(input)).rejects.toThrow(
      'SCENE_COUNT_MISMATCH: requested 12, received 15',
    );
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });
});
