import { describe, expect, test } from 'vitest';
import { generateClassroomSchema } from '@/lib/api/schemas';

const baseInput = {
  orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
  requirement: 'Former une équipe au pilotage de trésorerie.',
  learningApproach: 'andragogy' as const,
  interactionLevel: 'immersive' as const,
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
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
