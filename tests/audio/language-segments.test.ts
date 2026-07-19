import { describe, it, expect } from 'vitest';
import { splitTextIntoLanguageSegments } from '@/lib/audio/language-segments';
import { ANGLICISM_TERMS } from '@/lib/audio/anglicism-dictionary';

describe('splitTextIntoLanguageSegments', () => {
  it('keeps a pure French sentence as a single fr segment', () => {
    const segments = splitTextIntoLanguageSegments(
      'Nous allons gérer notre budget de production.',
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: 'Nous allons gérer notre budget de production.', language: 'fr' },
    ]);
  });

  it('isolates a known anglicism as its own en segment', () => {
    const segments = splitTextIntoLanguageSegments(
      'Nous allons configurer LiteLLM pour la production.',
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: 'Nous allons configurer', language: 'fr' },
      { text: 'LiteLLM', language: 'en' },
      { text: 'pour la production.', language: 'fr' },
    ]);
  });

  it('keeps a French connector between two anglicisms as its own fr segment (never mispronounce "et chez" in English)', () => {
    const segments = splitTextIntoLanguageSegments(
      "C'est le standard utilisé au MIT et chez LiteLLM aujourd'hui.",
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: "C'est le standard utilisé au", language: 'fr' },
      { text: 'MIT', language: 'en' },
      { text: 'et chez', language: 'fr' },
      { text: 'LiteLLM', language: 'en' },
      { text: "aujourd'hui.", language: 'fr' },
    ]);
  });

  it('merges two adjacent anglicisms (no French word between them) into a single en segment', () => {
    const segments = splitTextIntoLanguageSegments('Le duo LiteLLM MIT est cité en exemple.', [
      ...ANGLICISM_TERMS,
    ]);
    expect(segments).toEqual([
      { text: 'Le duo', language: 'fr' },
      { text: 'LiteLLM MIT', language: 'en' },
      { text: 'est cité en exemple.', language: 'fr' },
    ]);
  });

  it('does not match a dictionary term as a substring of another French word', () => {
    // "MIT" must not match inside "admit" / "mitaine" — word-boundary only
    const segments = splitTextIntoLanguageSegments('Elle porte des mitaines.', ANGLICISM_TERMS);
    expect(segments).toEqual([{ text: 'Elle porte des mitaines.', language: 'fr' }]);
  });

  it('covers the technical LiteLLM vocabulary without converting ordinary French words', () => {
    const segments = splitTextIntoLanguageSegments(
      'Le proxy LiteLLM applique un fallback via API, cache le budget et expose un dashboard.',
      ANGLICISM_TERMS,
    );

    expect(segments).toEqual([
      { text: 'Le', language: 'fr' },
      { text: 'proxy LiteLLM', language: 'en' },
      { text: 'applique un', language: 'fr' },
      { text: 'fallback', language: 'en' },
      { text: 'via', language: 'fr' },
      { text: 'API', language: 'en' },
      { text: ', cache le budget et expose un', language: 'fr' },
      { text: 'dashboard', language: 'en' },
      { text: '.', language: 'fr' },
    ]);
  });

  it('returns a single fr segment for empty or whitespace-only text', () => {
    expect(splitTextIntoLanguageSegments('   ', ANGLICISM_TERMS)).toEqual([
      { text: '', language: 'fr' },
    ]);
  });
});
