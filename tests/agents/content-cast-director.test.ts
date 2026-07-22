import { describe, expect, it } from 'vitest';
import { DEFAULT_LEARNING_DESIGN } from '@/lib/agents/persona-catalog';
import {
  buildContentCastPrompt,
  parseContentCastMechanisms,
} from '@/lib/agents/content-cast-director';

describe('content cast director', () => {
  it('construit une consigne qui interdit la création de nouvelles identités', () => {
    const prompt = buildContentCastPrompt({
      courseTitle: 'Décider avec les données',
      outlines: [{ title: 'Mesurer' }],
      personas: DEFAULT_LEARNING_DESIGN.personas,
    });

    expect(prompt).toContain('Do not invent people, names, voices, avatars, roles, or mechanisms.');
    expect(prompt).toContain('analyst');
  });

  it('conserve uniquement les mécanismes autorisés et distincts', () => {
    expect(
      parseContentCastMechanisms(
        '```json\n{"mechanismIds":["analyst","unknown","analyst","coach"]}\n```',
        ['analyst', 'coach'],
      ),
    ).toEqual(['analyst', 'coach']);
  });
});
