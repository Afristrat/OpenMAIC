import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEARNING_DESIGN,
  PERSONA_CATALOG,
  approachForAudience,
  buildTenantAgentConfigs,
  learningDesignFromSettings,
} from '@/lib/agents/persona-catalog';
import { validatePersonaSettings } from '@/lib/agents/persona-validation';

describe('ten-persona learning design', () => {
  it('defines ten unique mechanisms with one lead teacher', () => {
    expect(PERSONA_CATALOG).toHaveLength(10);
    expect(new Set(PERSONA_CATALOG.map((persona) => persona.id)).size).toBe(10);
    expect(PERSONA_CATALOG.filter((persona) => persona.role === 'teacher')).toHaveLength(1);
    expect(PERSONA_CATALOG.find((persona) => persona.id === 'coach')?.label).toBe('La Coach');
  });

  it.each(['guided', 'balanced', 'immersive'] as const)(
    'allocates exactly 100%% of target turns in %s mode',
    (level) => {
      expect(
        PERSONA_CATALOG.reduce((total, persona) => total + persona.interactionWeights[level], 0),
      ).toBe(100);
    },
  );

  it('accepts the canonical gender-avatar-voice combinations', () => {
    expect(validatePersonaSettings({ learningDesign: DEFAULT_LEARNING_DESIGN })).toBeNull();
  });

  it('builds the complete immersive roster with persisted identities and weights', () => {
    const configs = buildTenantAgentConfigs({
      ...DEFAULT_LEARNING_DESIGN,
      interactionLevel: 'immersive',
    });

    expect(configs).toHaveLength(10);
    expect(configs[0]).toMatchObject({
      id: 'persona-professor',
      mechanismId: 'professor',
      gender: 'male',
      interactionWeight: 20,
      voiceConfig: { providerId: 'higgs-tts', voiceId: 'younes' },
    });
    expect(configs.map((config) => config.interactionWeight).reduce((a, b) => a + b, 0)).toBe(100);
    expect(configs[0]?.persona).toBe(PERSONA_CATALOG[0]?.persona);
  });

  it('rejects a cross-gender avatar even outside the UI', () => {
    const personas = DEFAULT_LEARNING_DESIGN.personas.map((persona) => ({ ...persona }));
    personas[0] = { ...personas[0], avatar: '/avatars/teacher-2.png' };

    expect(
      validatePersonaSettings({
        learningDesign: { ...DEFAULT_LEARNING_DESIGN, personas },
      }),
    ).toContain('Avatar gender mismatch');
  });

  it('derives the approach from learner stage, not proficiency', () => {
    expect(approachForAudience('child')).toBe('pedagogy');
    expect(approachForAudience('adolescent')).toBe('pedagogy');
    expect(approachForAudience('higher-education')).toBe('hybrid');
    expect(approachForAudience('adult-professional')).toBe('andragogy');
  });

  it('migrates the previous teacher profile into the professor mechanism', () => {
    const design = learningDesignFromSettings({
      teachingProfile: {
        name: 'Hanae',
        avatar: '/avatars/teacher-2.png',
        providerId: 'higgs-tts',
        voiceId: 'hanae',
      },
    });
    const professor = design.personas.find((persona) => persona.id === 'professor');

    expect(professor).toMatchObject({
      defaultName: 'Hanae',
      gender: 'female',
      avatar: '/avatars/teacher-2.png',
      voiceId: 'hanae',
    });
  });
});
