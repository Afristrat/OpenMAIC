import { describe, expect, it } from 'vitest';
import { buildContextualSpecialistSystemPrompt } from '@/lib/agents/contextual-specialist-prompt';

describe('buildContextualSpecialistSystemPrompt', () => {
  it('grounds names in the learning territory instead of language alone', () => {
    const prompt = buildContextualSpecialistSystemPrompt({
      locale: 'fr-FR',
      territory: 'Maroc',
    });

    expect(prompt).toContain('learners in Maroc');
    expect(prompt).toContain('genuinely used in Maroc');
    expect(prompt).toContain('language alone is not sufficient');
    expect(prompt).toContain('Align each name with the declared binary voice gender');
  });

  it('keeps Arabic output while using an English ESCO search term', () => {
    const prompt = buildContextualSpecialistSystemPrompt({
      locale: 'ar-MA',
      territory: 'Maroc',
    });

    expect(prompt).toContain('displayName and reason must be in Modern Standard Arabic');
    expect(prompt).toContain('searchTerm must be a concise occupation title in English');
  });
});
