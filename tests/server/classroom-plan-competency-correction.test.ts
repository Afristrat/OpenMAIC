import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  callLLM: vi.fn(),
  resolveModel: vi.fn(),
  optimization: vi.fn(),
  resolveFramework: vi.fn(),
}));
vi.mock('@/lib/server/generation-optimization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/generation-optimization')>()),
  loadGenerationOptimization: mocks.optimization,
}));
vi.mock('@/lib/server/course-generation-access', () => ({
  assertCourseGenerationAccess: mocks.authorize,
}));
vi.mock('@/lib/server/plan-framework', () => ({
  resolveCompetencyFramework: mocks.resolveFramework,
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

import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';

const input = {
  orgId: 'org-1',
  authorRole: 'author' as const,
  requirement: 'Former des conseillers à l’accueil client.',
  language: 'fr-FR' as const,
  learningApproach: 'andragogy' as const,
  interactionLevel: 'immersive' as const,
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
  competencyFramework: {
    occupationUri: 'http://data.europa.eu/esco/occupation/x',
    skillUris: ['u-a', 'u-b'],
  },
};

function planWith(competenciesPerScene: unknown[][]) {
  return JSON.stringify({
    languageDirective: 'Teach in French.',
    courseTitle: 'Accueil client',
    outlines: competenciesPerScene.map((competencies, index) => ({
      id: `scene-${index + 1}`,
      type: 'slide',
      title: `Scene ${index + 1}`,
      description: `Complete scene ${index + 1}`,
      keyPoints: [`Point ${index + 1}`],
      order: index + 1,
      competencies,
    })),
  });
}

describe('couverture des compétences essentielles à la génération du plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockReset().mockResolvedValue(undefined);
    mocks.optimization.mockReset().mockResolvedValue(null);
    mocks.resolveFramework.mockReset().mockResolvedValue({
      occupation: {
        uri: 'http://data.europa.eu/esco/occupation/x',
        titleFr: 'Conseiller',
        isco08: '2423',
        referentialVersion: 'v1',
      },
      skills: [
        { uri: 'u-a', title: 'Écouter', nature: 'essentielle' },
        { uri: 'u-b', title: 'Conseiller', nature: 'essentielle' },
      ],
    });
    mocks.resolveModel.mockResolvedValue({
      providerId: 'test-provider',
      model: {},
      apiKey: 'test-key',
      modelInfo: { outputWindow: 4096 },
      thinkingConfig: undefined,
    });
  });

  test('reprend le plan une fois quand une essentielle n’est travaillée nulle part, en la nommant', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({ text: planWith([['C1'], ['C1']]) })
      .mockResolvedValueOnce({ text: planWith([['C1'], ['C2']]) });

    const plan = await generateClassroomPlan(input, 'owner');

    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    const retry = mocks.callLLM.mock.calls[1]?.[0]?.messages as Array<{ content: string }>;
    expect(retry[1]?.content).toContain('AUTHORITATIVE CORRECTION');
    expect(retry[1]?.content).toContain('C2 (Conseiller)');
    expect(plan.outlines.map((outline) => outline.competencies)).toEqual([['C1'], ['C2']]);
    expect(plan.competencyFramework?.skills.map((skill) => skill.code)).toEqual(['C1', 'C2']);
  });

  test('ne reprend rien quand toutes les essentielles sont déjà travaillées', async () => {
    mocks.callLLM.mockResolvedValueOnce({ text: planWith([['C1', 'C2'], ['C2']]) });

    const plan = await generateClassroomPlan(input, 'owner');

    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(plan.outlines[0]?.competencies).toEqual(['C1', 'C2']);
  });

  test('écarte les codes inventés avant de juger la couverture', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({ text: planWith([['C1', 'C9'], ['C7']]) })
      .mockResolvedValueOnce({ text: planWith([['C1'], ['C2', 'C9']]) });

    const plan = await generateClassroomPlan(input, 'owner');

    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    expect(plan.outlines.map((outline) => outline.competencies)).toEqual([['C1'], ['C2']]);
  });
});
