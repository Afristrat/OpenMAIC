import type { TTSProviderId } from '@/lib/audio/types';

export interface OccupationalProfile {
  standard: 'ISCO-08';
  unitGroupCode: string;
  unitGroupTitle: string;
  occupationDescription: string;
  tasks: string[];
  sourceTasks: string[];
  taskLocale: 'fr-FR' | 'ar-MA' | 'en-US';
  sourceVersion: 'v1.2.1';
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
