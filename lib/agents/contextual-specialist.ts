import type { TTSProviderId } from '@/lib/audio/types';

export interface ContextualSpecialist {
  id: string;
  name: string;
  occupationTitle: string;
  iscoCode: string;
  escoUri: string;
  reason: string;
  gender: 'female' | 'male';
  avatar: string;
  role: 'assistant';
  persona: string;
  voiceConfig: {
    providerId: TTSProviderId;
    voiceId: string;
  };
}
