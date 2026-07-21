export const FORMATION_ENGINE_REFERENCES = {
  platformPublication: 'skills/formation-design-pro/manifest.json',
  compiledPlan: 'skills/qalem-prompt-compiler/references/compiled-plan.schema.json',
  designPolicies: 'skills/qalem-prompt-compiler/references/design-policy-contract.md',
  evaluationPromotion: 'skills/qalem-prompt-compiler/references/evaluation-promotion-contract.md',
} as const;

export const FORMATION_ENGINE_CONSUMERS = {
  livePersonalityRegistry: 'vivre-personality-registry',
  anchoringSeedRegistry: 'ancrer-seed-registry',
} as const;

export interface LiveInstructionalContext {
  approach: 'pedagogy' | 'hybrid' | 'andragogy';
  audienceStage: 'child' | 'adolescent' | 'higher-education' | 'adult-professional';
  expertiseLevel: 'beginner' | 'intermediate' | 'advanced';
  interactionLevel: 'guided' | 'balanced' | 'immersive';
}

export function buildLiveInstructionalDirective(context: LiveInstructionalContext): string {
  return [
    `[Formation engine consumer: ${FORMATION_ENGINE_CONSUMERS.livePersonalityRegistry}]`,
    `Platform publication: ${FORMATION_ENGINE_REFERENCES.platformPublication}.`,
    `Instructional approach: ${context.approach}. Learner stage: ${context.audienceStage}. Proficiency: ${context.expertiseLevel}. Interaction level: ${context.interactionLevel}.`,
    'Apply the active compiled formation contract to the live intervention.',
    'Adapt tone, scaffolding, examples and learner autonomy to explicit or evidenced context; label unsupported assumptions.',
    'Use no universal theory, practice, peer-learning, local-context or speaking-time ratio.',
    'Keep the persona voice distinct, but never let it override the target performance, source constraints, accessibility, safety or assessment contract.',
  ].join('\n');
}
