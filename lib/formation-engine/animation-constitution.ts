import { z } from 'zod';
import type { GeneratedAgentConfig, Scene } from '@/lib/types/stage';

export const LEARNING_APPROACHES = ['pedagogy', 'hybrid', 'andragogy'] as const;
export const INTERACTION_LEVELS = ['guided', 'balanced', 'immersive'] as const;
export const INTERVENTION_FORMS = [
  'question',
  'objection',
  'synthesis',
  'example',
  'feedback',
  'use-case',
  'anecdote',
  'humor',
  'disagreement',
  'blind-spot',
  'clarification',
  'challenge',
  'regulation',
] as const;
export const ADAPTIVE_TRIGGERS = [
  'learner-answer',
  'learner-question',
  'hesitation',
  'silence',
  'misconception',
  'confusion',
  'cognitive-overload',
  'high-confidence',
  'low-confidence',
  'topic-transition',
  'transfer-opportunity',
  'unaddressed-risk',
] as const;
export const LIVE_INTERVENTION_TRIGGERS = ['play', ...ADAPTIVE_TRIGGERS] as const;

const identifier = z.string().trim().min(1).max(160);
const purposefulText = z.string().trim().min(8).max(2_000);
const interventionForm = z.enum(INTERVENTION_FORMS);
const modality = z.enum(['text', 'voice', 'both']);

const agentSnapshotSchema = z
  .object({
    agentId: identifier,
    displayName: z.string().trim().min(1).max(120),
    avatarId: identifier,
    voiceId: identifier,
    identityCompatibility: z.literal('validated'),
    organizationWeight: z.number().finite().min(0).max(100),
    enabled: z.boolean(),
    allowedForms: z.array(interventionForm).min(1),
    allowedModalities: z.array(modality).min(1),
  })
  .strict();

const adaptiveRuleSchema = z
  .object({
    id: identifier,
    trigger: z.enum(ADAPTIVE_TRIGGERS),
    purpose: purposefulText,
    allowedForms: z.array(interventionForm).min(1),
    eligibleAgentIds: z.array(identifier).min(1),
    requiresGrounding: z.boolean(),
    mayInterrupt: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();

const authoredBeatSchema = z
  .object({
    id: identifier,
    sceneId: identifier,
    moment: z.enum(['before', 'during', 'after']),
    activation: z.enum(['always', 'if-needed']),
    purpose: purposefulText,
    preferredForms: z.array(interventionForm).min(1),
    eligibleAgentIds: z.array(identifier).min(1),
    modality,
  })
  .strict();

export const animationConstitutionSchema = z
  .object({
    schemaVersion: z.literal(1),
    classroomId: identifier,
    authoredBy: z
      .object({
        userId: identifier,
        role: z.enum(['author', 'super-admin']),
        organizationId: identifier,
      })
      .strict(),
    approach: z.enum(LEARNING_APPROACHES),
    interactionLevel: z.enum(INTERACTION_LEVELS),
    learningIntent: z
      .object({
        targetPerformance: purposefulText,
        successEvidence: z.array(purposefulText).min(1).max(20),
      })
      .strict(),
    policy: z
      .object({
        responseMode: z.literal('adaptive'),
        weightSource: z.literal('organization-roster-snapshot'),
        allowedModalities: z.array(modality).min(1),
        prohibitedTopics: z.array(z.string().trim().min(1).max(240)).max(100),
        maxConsecutiveAgentTurns: z.number().int().min(1).max(3),
        numericPolicyRationale: purposefulText,
      })
      .strict(),
    agentRosterSnapshot: z.array(agentSnapshotSchema).min(1).max(20),
    authoredBackbone: z.array(authoredBeatSchema).min(1).max(500),
    adaptiveRules: z.array(adaptiveRuleSchema).min(1).max(100),
  })
  .strict()
  .superRefine((constitution, context) => {
    const agentIds = new Set(constitution.agentRosterSnapshot.map((agent) => agent.agentId));
    const enabledAgentIds = new Set(
      constitution.agentRosterSnapshot
        .filter((agent) => agent.enabled)
        .map((agent) => agent.agentId),
    );

    const checkAgentReferences = (ids: string[], path: (string | number)[]) => {
      for (const id of ids) {
        if (!agentIds.has(id)) {
          context.addIssue({
            code: 'custom',
            path,
            message: `Unknown agentId "${id}".`,
          });
        } else if (!enabledAgentIds.has(id)) {
          context.addIssue({
            code: 'custom',
            path,
            message: `Disabled agentId "${id}" cannot be scheduled.`,
          });
        }
      }
    };

    constitution.authoredBackbone.forEach((beat, index) =>
      checkAgentReferences(beat.eligibleAgentIds, ['authoredBackbone', index, 'eligibleAgentIds']),
    );
    constitution.adaptiveRules.forEach((rule, index) =>
      checkAgentReferences(rule.eligibleAgentIds, ['adaptiveRules', index, 'eligibleAgentIds']),
    );
  });

export type AnimationConstitution = z.infer<typeof animationConstitutionSchema>;

export const interventionDecisionSchema = z
  .object({
    decisionId: identifier,
    classroomId: identifier,
    interactionId: identifier,
    sceneId: identifier.nullable(),
    turnIndex: z.number().int().min(0).max(100),
    agentId: identifier,
    agentName: z.string().trim().min(1).max(120),
    trigger: z.enum(LIVE_INTERVENTION_TRIGGERS),
    form: interventionForm,
    reason: purposefulText,
  })
  .strict();

export type InterventionDecision = z.infer<typeof interventionDecisionSchema>;

const FORMS_BY_MECHANISM: Record<
  string,
  AnimationConstitution['agentRosterSnapshot'][number]['allowedForms']
> = {
  professor: ['question', 'example', 'feedback', 'clarification', 'regulation', 'synthesis'],
  'teaching-assistant': ['clarification', 'example', 'feedback'],
  joker: ['humor', 'anecdote', 'example'],
  curious: ['question', 'blind-spot'],
  secretary: ['synthesis', 'regulation'],
  thinker: ['blind-spot', 'question', 'synthesis'],
  analyst: ['objection', 'disagreement', 'blind-spot', 'feedback'],
  coach: ['feedback', 'challenge', 'question'],
  'devils-advocate': ['objection', 'disagreement', 'blind-spot'],
  creative: ['example', 'use-case', 'anecdote', 'challenge'],
};

interface CreateAnimationConstitutionInput {
  classroomId: string;
  organizationId: string;
  authorUserId: string;
  authorRole: 'author' | 'super-admin';
  approach: AnimationConstitution['approach'];
  interactionLevel: AnimationConstitution['interactionLevel'];
  targetPerformance: string;
  scenes: Scene[];
  agents: GeneratedAgentConfig[];
}

export function createAnimationConstitution(
  input: CreateAnimationConstitutionInput,
): AnimationConstitution {
  const activeAgents = input.agents.filter(
    (agent) => agent.voiceConfig?.voiceId && agent.mechanismId,
  );
  if (activeAgents.length === 0) {
    throw new Error('An animation constitution requires at least one voiced tenant agent.');
  }

  const agentRosterSnapshot: AnimationConstitution['agentRosterSnapshot'] = activeAgents.map(
    (agent) => ({
      agentId: agent.id,
      displayName: agent.name,
      avatarId: agent.avatar,
      voiceId: agent.voiceConfig!.voiceId,
      identityCompatibility: 'validated',
      organizationWeight: agent.interactionWeight ?? 0,
      enabled: true,
      allowedForms: FORMS_BY_MECHANISM[agent.mechanismId!] ?? ['question', 'feedback'],
      allowedModalities: ['text', 'voice', 'both'],
    }),
  );

  const idsForForm = (form: (typeof INTERVENTION_FORMS)[number]): string[] => {
    const matching = agentRosterSnapshot
      .filter((agent) => agent.allowedForms.includes(form))
      .map((agent) => agent.agentId);
    return matching.length > 0 ? matching : [agentRosterSnapshot[0].agentId];
  };

  const authoredBackbone: AnimationConstitution['authoredBackbone'] = input.scenes.map(
    (scene, index) => ({
      id: `scene-${index + 1}-reflection`,
      sceneId: scene.id,
      moment: 'after',
      activation: 'if-needed',
      purpose: `Vérifier la compréhension et le transfert de « ${scene.title} » avant de poursuivre.`,
      preferredForms: index === input.scenes.length - 1 ? ['synthesis', 'challenge'] : ['question'],
      eligibleAgentIds:
        index === input.scenes.length - 1 ? idsForForm('synthesis') : idsForForm('question'),
      modality: 'both',
    }),
  );

  const adaptiveRules: AnimationConstitution['adaptiveRules'] = [
    {
      id: 'respond-to-question',
      trigger: 'learner-question',
      purpose: 'Répondre précisément à la question avant d’ajouter un autre angle utile.',
      allowedForms: ['clarification', 'feedback', 'question'],
      eligibleAgentIds: [
        ...new Set([
          ...idsForForm('clarification'),
          ...idsForForm('feedback'),
          ...idsForForm('question'),
        ]),
      ],
      requiresGrounding: false,
      mayInterrupt: false,
      enabled: true,
    },
    {
      id: 'respond-to-learner',
      trigger: 'learner-answer',
      purpose: 'Réagir au raisonnement exprimé et demander une précision utile si nécessaire.',
      allowedForms: ['feedback', 'question'],
      eligibleAgentIds: [...new Set([...idsForForm('feedback'), ...idsForForm('question')])],
      requiresGrounding: false,
      mayInterrupt: false,
      enabled: true,
    },
    {
      id: 'support-hesitation',
      trigger: 'hesitation',
      purpose: 'Distinguer une difficulté de formulation d’une incompréhension du concept.',
      allowedForms: ['clarification', 'question'],
      eligibleAgentIds: [...new Set([...idsForForm('clarification'), ...idsForForm('question')])],
      requiresGrounding: false,
      mayInterrupt: false,
      enabled: true,
    },
    {
      id: 'surface-blind-spot',
      trigger: 'unaddressed-risk',
      purpose:
        'Faire apparaître un risque ou une hypothèse importante sans polémique artificielle.',
      allowedForms: ['blind-spot', 'objection'],
      eligibleAgentIds: [...new Set([...idsForForm('blind-spot'), ...idsForForm('objection')])],
      requiresGrounding: true,
      mayInterrupt: false,
      enabled: true,
    },
    {
      id: 'enable-transfer',
      trigger: 'transfer-opportunity',
      purpose: 'Relier le concept à une décision ou une situation réellement réutilisable.',
      allowedForms: ['use-case', 'challenge'],
      eligibleAgentIds: [...new Set([...idsForForm('use-case'), ...idsForForm('challenge')])],
      requiresGrounding: true,
      mayInterrupt: false,
      enabled: true,
    },
  ];

  return animationConstitutionSchema.parse({
    schemaVersion: 1,
    classroomId: input.classroomId,
    authoredBy: {
      userId: input.authorUserId,
      role: input.authorRole,
      organizationId: input.organizationId,
    },
    approach: input.approach,
    interactionLevel: input.interactionLevel,
    learningIntent: {
      targetPerformance: input.targetPerformance,
      successEvidence: [
        'L’apprenant formule une réponse ou réalise une action observable alignée sur la demande de formation.',
      ],
    },
    policy: {
      responseMode: 'adaptive',
      weightSource: 'organization-roster-snapshot',
      allowedModalities: ['text', 'voice', 'both'],
      prohibitedTopics: [],
      maxConsecutiveAgentTurns: input.interactionLevel === 'guided' ? 1 : 2,
      numericPolicyRationale:
        'La limite préserve une prise de parole réelle de l’apprenant tout en appliquant le niveau d’interaction choisi par l’auteur.',
    },
    agentRosterSnapshot,
    authoredBackbone,
    adaptiveRules,
  });
}

export function buildAnimationDirective(
  constitution: AnimationConstitution | undefined,
  sceneId: string | null,
): string {
  if (!constitution) return '';
  const beats = constitution.authoredBackbone.filter((beat) => beat.sceneId === sceneId);
  const rules = constitution.adaptiveRules.filter((rule) => rule.enabled);

  return [
    '# Server-owned animation constitution',
    `Learning approach selected by the author: ${constitution.approach}.`,
    `Interaction level: ${constitution.interactionLevel}.`,
    `Target performance: ${constitution.learningIntent.targetPerformance}`,
    `Maximum consecutive agent turns: ${constitution.policy.maxConsecutiveAgentTurns}.`,
    'Every intervention must advance the target performance. Never make an agent speak merely to satisfy its weight.',
    'A learner pressing Play is an explicit interaction trigger. At the end of the current scene, use the authored backbone only when an intervention adds learning value.',
    'React to the learner’s actual answer, question, hesitation or misunderstanding before adding proactive material.',
    'Ground factual examples, use cases, anecdotes and blind spots in authorized course sources; otherwise label them as synthetic.',
    beats.length > 0
      ? `Current scene backbone: ${beats
          .map(
            (beat) =>
              `${beat.activation}/${beat.moment}: ${beat.purpose}; forms=${beat.preferredForms.join('/')}; agents=${beat.eligibleAgentIds.join(',')}`,
          )
          .join(' | ')}`
      : 'Current scene has no mandatory authored beat.',
    `Adaptive rules: ${rules
      .map(
        (rule) =>
          `${rule.trigger} => ${rule.allowedForms.join('/')} with agents=${rule.eligibleAgentIds.join(',')} for ${rule.purpose}${rule.requiresGrounding ? ' [grounding required]' : ''}`,
      )
      .join(' | ')}`,
  ].join('\n');
}

export function validateInterventionDecision(
  constitution: AnimationConstitution,
  decision: InterventionDecision,
): { success: true } | { success: false; reason: string } {
  const parsed = interventionDecisionSchema.safeParse(decision);
  if (!parsed.success) return { success: false, reason: parsed.error.issues[0]?.message ?? 'invalid' };
  if (decision.classroomId !== constitution.classroomId) {
    return { success: false, reason: 'The decision targets another classroom.' };
  }

  const agent = constitution.agentRosterSnapshot.find(
    (candidate) => candidate.agentId === decision.agentId && candidate.enabled,
  );
  if (!agent) return { success: false, reason: 'The selected agent is not enabled in the roster.' };
  if (!agent.allowedForms.includes(decision.form)) {
    return { success: false, reason: 'The selected agent cannot use this intervention form.' };
  }

  if (decision.trigger === 'play') {
    const beat = constitution.authoredBackbone.find(
      (candidate) =>
        candidate.sceneId === decision.sceneId &&
        candidate.eligibleAgentIds.includes(decision.agentId) &&
        candidate.preferredForms.includes(decision.form),
    );
    return beat
      ? { success: true }
      : { success: false, reason: 'No authored beat authorizes this Play intervention.' };
  }

  const rule = constitution.adaptiveRules.find(
    (candidate) =>
      candidate.enabled &&
      candidate.trigger === decision.trigger &&
      candidate.eligibleAgentIds.includes(decision.agentId) &&
      candidate.allowedForms.includes(decision.form),
  );
  return rule
    ? { success: true }
    : { success: false, reason: 'No adaptive rule authorizes this intervention.' };
}

export function parseAnimationConstitution(
  input: unknown,
): { success: true; constitution: AnimationConstitution } | { success: false; errors: string[] } {
  const parsed = animationConstitutionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  return { success: true, constitution: parsed.data };
}
