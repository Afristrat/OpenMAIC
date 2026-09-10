import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: vi.fn().mockResolvedValue({
    user: { id: 'author-1', email: 'author@example.test' },
    authoredByRole: 'author',
  }),
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn().mockResolvedValue({
    model: { modelId: 'test-model' },
    thinkingConfig: undefined,
  }),
}));

import { POST } from '@/app/api/generate/assist-syllabus/route';

const plan = {
  courseTitle: 'Amélioration des processus',
  languageDirective: 'Rédiger en français.',
  syllabus: {
    audience: 'Responsables des opérations',
    prerequisites: 'Connaître un processus réel',
    overallObjective: 'Améliorer un processus réel',
    learningObjectives: ['Cartographier le processus'],
    totalDurationMinutes: 45,
    deliveryMode: 'Formation immersive',
    assessmentStrategy: 'Évaluer le classeur produit',
    expectedDeliverable: 'Plan d’action sur 30 jours',
  },
  outlines: [
    {
      id: 'scene_1',
      type: 'slide',
      title: 'Cartographier',
      description: 'Cartographier le processus réel.',
      keyPoints: ['Départ', 'Arrivée'],
      teachingObjective: 'Produire une carte fidèle du processus.',
      estimatedDuration: 180,
      order: 1,
    },
  ],
};

describe('POST /api/generate/assist-syllabus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callLLM.mockResolvedValue({ text: JSON.stringify(plan) });
  });

  test.each([true, false])(
    'preserves only existing display evidence, present=%s',
    async (present) => {
      const optimization = {
        recommendedSceneOrder: ['slide'],
        difficultyModifier: -0.2,
        sampleSize: 1,
        selectedSequenceSampleSize: 1,
        observedMeanQuizScore: 0.4,
        selectedSequenceMeanQuizScore: 0.4,
        evidence: 'observational',
        observationWindowLimit: 1000,
      };
      mocks.callLLM.mockResolvedValue({
        text: JSON.stringify({ ...plan, optimization: { sampleSize: 999, fabricated: true } }),
      });
      const response = await POST(
        new NextRequest('http://localhost/api/generate/assist-syllabus', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
            locale: 'fr-FR',
            learningApproach: 'andragogy',
            interactionLevel: 'immersive',
            target: { kind: 'syllabus' },
            plan: { ...plan, ...(present ? { optimization } : {}) },
          }),
        }),
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      if (present) expect(result.plan.optimization).toEqual(optimization);
      else expect(result.plan).not.toHaveProperty('optimization');
    },
  );

  test('grounds the revision in the validated approach and interaction level', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate/assist-syllabus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
          locale: 'fr-FR',
          learningApproach: 'andragogy',
          interactionLevel: 'immersive',
          target: { kind: 'scene', sceneIndex: 0 },
          plan,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const prompt = mocks.callLLM.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain('<learning_approach>andragogy</learning_approach>');
    expect(prompt).toContain('<interaction_level>immersive</interaction_level>');
    expect(prompt).toContain('<target_scene_index>0</target_scene_index>');
  });
});
