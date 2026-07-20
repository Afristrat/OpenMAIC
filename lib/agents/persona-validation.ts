import { TTS_PROVIDERS } from '@/lib/audio/constants';
import {
  PERSONA_CATALOG,
  learningDesignFromSettings,
  type InteractionLevel,
} from '@/lib/agents/persona-catalog';

/** Validate the tenant roster at the trusted API boundary. */
export function validatePersonaSettings(settings: unknown): string | null {
  const rawLearningDesign = (settings as { learningDesign?: unknown } | null)?.learningDesign;
  if (rawLearningDesign === undefined) return null;

  const design = learningDesignFromSettings(settings);
  const expectedIds = new Set(PERSONA_CATALOG.map((persona) => persona.id));
  if (design.personas.length !== expectedIds.size)
    return 'Exactly ten pedagogical personas are required';
  if (design.personas.some((persona) => !expectedIds.has(persona.id))) {
    return 'Unknown pedagogical persona';
  }
  if (design.personas.filter((persona) => persona.role === 'teacher').length !== 1) {
    return 'Exactly one lead teacher is required';
  }

  for (const persona of design.personas) {
    if (!persona.defaultName.trim() || !persona.persona.trim()) {
      return `Name and persona are required for ${persona.id}`;
    }
    const avatarGender = PERSONA_CATALOG.find(
      (candidate) => candidate.avatar === persona.avatar,
    )?.gender;
    if (avatarGender !== persona.gender) return `Avatar gender mismatch for ${persona.id}`;

    const voice = TTS_PROVIDERS[persona.providerId as keyof typeof TTS_PROVIDERS]?.voices.find(
      (candidate) => candidate.id === persona.voiceId,
    );
    if (!voice || (voice.gender !== 'neutral' && voice.gender !== persona.gender)) {
      return `Voice gender mismatch for ${persona.id}`;
    }
  }

  for (const level of ['guided', 'balanced', 'immersive'] as InteractionLevel[]) {
    const total = design.personas
      .filter((persona) => persona.enabled)
      .reduce((sum, persona) => sum + persona.interactionWeights[level], 0);
    if (total !== 100) return `Interaction weights must total 100 for ${level}`;
  }

  return null;
}
