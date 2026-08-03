import { describe, expect, it } from 'vitest';
import {
  buildAnimationDirective,
  createAnimationConstitution,
  parseAnimationConstitution,
} from '@/lib/formation-engine/animation-constitution';
import type { GeneratedAgentConfig, Scene } from '@/lib/types/stage';

function validConstitution(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    classroomId: 'classroom-litellm',
    authoredBy: {
      userId: 'author-1',
      role: 'author',
      organizationId: 'org-1',
    },
    approach: 'andragogy',
    interactionLevel: 'immersive',
    learningIntent: {
      targetPerformance: 'Configurer un proxy LiteLLM fiable dans une situation réelle.',
      successEvidence: ['Le participant démontre un routage fonctionnel et explique ses choix.'],
    },
    policy: {
      responseMode: 'adaptive',
      weightSource: 'organization-roster-snapshot',
      allowedModalities: ['text', 'voice'],
      prohibitedTopics: [],
      maxConsecutiveAgentTurns: 1,
      numericPolicyRationale:
        "Préserver une réponse réelle de l'apprenant entre deux prises de parole d'agents.",
    },
    agentRosterSnapshot: [
      {
        agentId: 'coach-nadia',
        displayName: 'Nadia',
        avatarId: 'avatar-nadia',
        voiceId: 'voice-nadia-fr',
        identityCompatibility: 'validated',
        organizationWeight: 70,
        enabled: true,
        allowedForms: ['question', 'feedback', 'blind-spot'],
        allowedModalities: ['text', 'voice'],
      },
    ],
    authoredBackbone: [
      {
        id: 'beat-1',
        sceneId: 'scene-1',
        moment: 'after',
        activation: 'if-needed',
        purpose: 'Vérifier que le participant sait transférer la configuration à son contexte.',
        preferredForms: ['question'],
        eligibleAgentIds: ['coach-nadia'],
        modality: 'both',
      },
    ],
    adaptiveRules: [
      {
        id: 'rule-hesitation',
        trigger: 'hesitation',
        purpose: 'Distinguer un manque de vocabulaire d’une difficulté de raisonnement.',
        allowedForms: ['clarification', 'question'],
        eligibleAgentIds: ['coach-nadia'],
        requiresGrounding: false,
        mayInterrupt: false,
        enabled: true,
      },
    ],
  };
}

describe('animation constitution', () => {
  it('accepts an author-owned adaptive plan with a validated roster snapshot', () => {
    const result = parseAnimationConstitution(validConstitution());
    expect(result.success).toBe(true);
  });

  it('refuses to infer the learning approach when the author did not select it', () => {
    const input = validConstitution();
    delete input.approach;
    const result = parseAnimationConstitution(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('approach');
  });

  it('refuses a role that is not allowed to author a constitution', () => {
    const input = validConstitution();
    input.authoredBy = { userId: 'viewer-1', role: 'viewer', organizationId: 'org-1' };
    const result = parseAnimationConstitution(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('authoredBy.role');
  });

  it('refuses an avatar and voice identity that the organization has not validated', () => {
    const input = validConstitution();
    const roster = input.agentRosterSnapshot as Array<Record<string, unknown>>;
    roster[0].identityCompatibility = 'pending';
    const result = parseAnimationConstitution(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('identityCompatibility');
  });

  it('refuses unknown or disabled agents in authored and adaptive interventions', () => {
    const input = validConstitution();
    const rules = input.adaptiveRules as Array<Record<string, unknown>>;
    rules[0].eligibleAgentIds = ['missing-agent'];
    const result = parseAnimationConstitution(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(' ')).toContain('Unknown agentId');
  });

  it('builds a persistent backbone and adaptive director directive from the tenant roster', () => {
    const constitution = createAnimationConstitution({
      classroomId: 'classroom-1',
      organizationId: 'org-1',
      authorUserId: 'author-1',
      authorRole: 'author',
      approach: 'andragogy',
      interactionLevel: 'immersive',
      targetPerformance: 'Diagnostiquer puis corriger un routage LiteLLM défaillant.',
      scenes: [
        { id: 'scene-1', title: 'Diagnostic', type: 'slide', order: 0, stageId: 'classroom-1' },
      ] as Scene[],
      agents: [
        {
          id: 'persona-professor',
          name: 'Younes',
          role: 'teacher',
          persona: 'Guide la réflexion.',
          avatar: '/avatars/teacher.png',
          color: '#3b82f6',
          priority: 8,
          interactionWeight: 20,
          mechanismId: 'professor',
          gender: 'male',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'younes' },
        },
      ] as GeneratedAgentConfig[],
    });

    expect(constitution.authoredBackbone).toHaveLength(1);
    expect(constitution.agentRosterSnapshot[0]).toMatchObject({
      displayName: 'Younes',
      voiceId: 'younes',
      identityCompatibility: 'validated',
      organizationWeight: 20,
    });
    const directive = buildAnimationDirective(constitution, 'scene-1');
    expect(directive).toContain('selected by the author: andragogy');
    expect(directive).toContain('Vérifier la compréhension');
    expect(directive).toContain('unaddressed-risk');
  });
});
