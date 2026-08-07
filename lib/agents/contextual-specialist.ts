import type { TTSProviderId } from '@/lib/audio/types';

export interface OccupationalProfile {
  standard: 'ISCO-08';
  unitGroupCode: string;
  unitGroupTitle: string;
  occupationDescription: string;
  tasks: string[];
  essentialSkills: string[];
  knowledge: string[];
  iscoUri: string;
  occupationUri: string;
  sourceUrl: string;
}

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
  occupationalProfile: OccupationalProfile;
  voiceConfig: {
    providerId: TTSProviderId;
    voiceId: string;
  };
}
