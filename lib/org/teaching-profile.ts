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
  const candidate = (settings as { teachingProfile?: Partial<TeachingProfile> } | null)?.teachingProfile;
  return {
    name: candidate?.name?.trim() || DEFAULT_TEACHING_PROFILE.name,
    avatar: candidate?.avatar?.trim() || DEFAULT_TEACHING_PROFILE.avatar,
    providerId: candidate?.providerId?.trim() || DEFAULT_TEACHING_PROFILE.providerId,
    voiceId: candidate?.voiceId?.trim() || DEFAULT_TEACHING_PROFILE.voiceId,
  };
}
