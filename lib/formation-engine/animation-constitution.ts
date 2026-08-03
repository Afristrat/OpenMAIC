import { z } from 'zod';

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
