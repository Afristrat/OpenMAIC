import type { LearningDesignSettings } from '@/lib/agents/persona-catalog';

export interface TeachingProfile {
  name: string;
  avatar: string;
  providerId: string;
  voiceId: string;
}

export const DEFAULT_TEACHING_PROFILE: TeachingProfile = {
  name: 'Hanae',
  avatar: '/avatars/teacher-2.png',
  providerId: 'higgs-tts',
  voiceId: 'hanae',
};

export function teachingProfileFromSettings(settings: unknown): TeachingProfile {
  const candidate = (settings as { teachingProfile?: Partial<TeachingProfile> } | null)
    ?.teachingProfile;
  return {
    name: candidate?.name?.trim() || DEFAULT_TEACHING_PROFILE.name,
    avatar: candidate?.avatar?.trim() || DEFAULT_TEACHING_PROFILE.avatar,
    providerId: candidate?.providerId?.trim() || DEFAULT_TEACHING_PROFILE.providerId,
    voiceId: candidate?.voiceId?.trim() || DEFAULT_TEACHING_PROFILE.voiceId,
  };
}

/**
 * Resolve the lead teacher from the tenant's ten-persona learning design.
 *
 * Classroom generation and later voice regeneration must use this exact
 * resolver: otherwise a regenerated male professor can silently fall back to
 * the historical female teaching-profile default.
 */
export function teachingProfileFromLearningDesign(
  learningDesign: LearningDesignSettings,
): TeachingProfile {
  const professor = learningDesign.personas.find((persona) => persona.id === 'professor');
  if (!professor) return DEFAULT_TEACHING_PROFILE;

  return {
    name: professor.defaultName,
    avatar: professor.avatar,
    providerId: professor.providerId,
    voiceId: professor.voiceId,
  };
}
