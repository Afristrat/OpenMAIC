import { describe, expect, test } from 'vitest';
import { generateClassroomSchema } from '@/lib/api/schemas';

const baseInput = {
  orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
  requirement: 'Former une équipe au pilotage de trésorerie.',
  learningApproach: 'andragogy' as const,
  interactionLevel: 'immersive' as const,
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
};

const occupationalProfile = {
  standard: 'ISCO-08' as const,
  unitGroupCode: '2413',
  unitGroupTitle: 'Analystes financiers',
  occupationDescription: 'Analyse les informations financières utiles à la décision.',
  tasks: ['analyser des données financières', 'préparer des prévisions financières'],
  sourceTasks: ['analyse financial data', 'prepare financial forecasts'],
  taskLocale: 'fr-FR' as const,
  sourceVersion: 'v1.2.1' as const,
  essentialSkills: ['analyser le risque financier'],
  knowledge: ['finance d’entreprise'],
  iscoUri: 'http://data.europa.eu/esco/isco/C2413',
  occupationUri: 'http://data.europa.eu/esco/occupation/example',
  sourceUrl: 'https://isco.ilo.org/en/isco-08/',
};

describe('generateClassroomSchema', () => {
  test('accepts the complete authoring contract', () => {
    const result = generateClassroomSchema.safeParse({
      ...baseInput,
      interactiveMode: true,
      enableImageGeneration: true,
      imageProviderId: 'openai-image',
      imageModelId: 'gemini-3-pro-image',
      enableVideoGeneration: false,
      enableTTS: true,
      agentMode: 'default',
      selectedPersonaIds: [
        'professor',
        'teaching-assistant',
        'joker',
        'curious',
        'secretary',
        'thinker',
        'analyst',
        'coach',
        'devils-advocate',
        'creative',
      ],
      teacherVoiceConfig: {
        providerId: 'higgs-tts',
        voiceId: 'hanae',
        voiceName: 'Hanae',
        gender: 'female',
      },
      contextualSpecialists: [
        {
          id: 'specialist-Ab12Cd34',
          name: 'Nadia',
          occupationTitle: 'analyste financier/analyste financière',
          iscoCode: '2413',
          escoUri: 'http://data.europa.eu/esco/occupation/example',
          reason: 'Relie les exercices aux décisions de trésorerie.',
          gender: 'female',
          avatar: '/avatars/assist.png',
          role: 'assistant',
          persona: 'Spécialiste financière qui apporte des situations de travail vérifiables.',
          occupationalProfile,
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageProviderId).toBe('openai-image');
      expect(result.data.imageModelId).toBe('gemini-3-pro-image');
    }
  });

  test('rejects a specialist without a four-digit ISCO-08 unit-group code', () => {
    const result = generateClassroomSchema.safeParse({
      ...baseInput,
      contextualSpecialists: [
        {
          id: 'specialist-Ab12Cd34',
          name: 'Nadia',
          occupationTitle: 'analyste financier/analyste financière',
          iscoCode: '24',
          escoUri: 'http://data.europa.eu/esco/occupation/example',
          reason: 'Expertise métier.',
          gender: 'female',
          avatar: '/avatars/assist.png',
          role: 'assistant',
          persona: 'Spécialiste financière.',
          occupationalProfile: { ...occupationalProfile, unitGroupCode: '24' },
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('requires an explicit territory and ISO 4217 currency', () => {
    const { learningContext: _learningContext, ...withoutContext } = baseInput;
    expect(generateClassroomSchema.safeParse(withoutContext).success).toBe(false);
    expect(
      generateClassroomSchema.safeParse({
        ...baseInput,
        learningContext: { territory: 'Maroc', currencyCode: 'euro' },
      }).success,
    ).toBe(false);
  });
});
