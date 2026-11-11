import { describe, expect, it } from 'vitest';
import {
  buildYoutubeDraft,
  normalizeYoutubeTags,
  parseAiMetadata,
  youtubeLanguageOf,
  youtubeTagsLength,
} from '@/lib/youtube/metadata';

const scenes = [
  { title: 'Le marché du leasing' },
  { title: 'Prospecter en ligne' },
  { title: null },
];

describe('brouillon de publication', () => {
  it('vidéo entière : nom de la formation, description et programme numéroté', () => {
    const draft = buildYoutubeDraft({
      courseName: 'Marketing digital du leasing',
      courseDescription: 'Pour les conseillers en crédit-bail.',
      language: 'fr-FR',
      scenes,
      chapterIndex: null,
    });
    expect(draft.title).toBe('Marketing digital du leasing');
    expect(draft.description).toBe(
      'Pour les conseillers en crédit-bail.\n\nAu programme :\n1. Le marché du leasing\n2. Prospecter en ligne',
    );
    expect(draft).toMatchObject({
      tags: ['Marketing digital du leasing'],
      categoryId: '27',
      defaultLanguage: 'fr',
    });
  });

  it('chapitre : titre de la scène, rappel de la formation, langue arabe', () => {
    const draft = buildYoutubeDraft({
      courseName: 'تسويق',
      courseDescription: null,
      language: 'ar-MA',
      scenes,
      chapterIndex: 1,
    });
    expect(draft.title).toBe('تسويق · Prospecter en ligne');
    expect(draft.description.startsWith('الفصل 2 : Prospecter en ligne')).toBe(true);
    expect(draft.defaultLanguage).toBe('ar');
  });

  it('retire les chevrons et borne le titre à 100 caractères', () => {
    const draft = buildYoutubeDraft({
      courseName: `<b>${'x'.repeat(150)}</b>`,
      courseDescription: null,
      language: null,
      scenes: [],
      chapterIndex: null,
    });
    expect(draft.title).not.toMatch(/[<>]/);
    expect(draft.title.length).toBeLessThanOrEqual(100);
    expect(draft.defaultLanguage).toBe('fr');
  });
});

describe('étiquettes', () => {
  it('compte comme YouTube : virgules et guillemets autour des étiquettes à espace', () => {
    expect(youtubeTagsLength(['a', 'b c'])).toBe(1 + 1 + 5);
  });

  it('dédoublonne sans tenir compte de la casse et coupe à 500 caractères', () => {
    expect(normalizeYoutubeTags(['Leasing', 'leasing', ' crédit , bail '])).toEqual([
      'Leasing',
      'crédit bail',
    ]);
    const many = normalizeYoutubeTags(Array.from({ length: 80 }, (_, i) => `etiquette${i}`));
    expect(youtubeTagsLength(many)).toBeLessThanOrEqual(500);
    expect(many.length).toBeLessThan(80);
  });

  it('ramène la langue de la formation au code YouTube', () => {
    expect(youtubeLanguageOf('en-US')).toBe('en');
    expect(youtubeLanguageOf('zh-CN')).toBe('fr');
  });
});

describe('réponse de l’IA', () => {
  it('lit un objet, même entouré d’une clôture de code, et nettoie les étiquettes', () => {
    expect(
      parseAiMetadata(
        '```json\n{"title":"Titre","description":"Desc <b>","tags":["a","A","b"]}\n```',
      ),
    ).toEqual({ title: 'Titre', description: 'Desc b', tags: ['a', 'b'] });
  });

  it('refuse un texte libre, un titre vide ou des champs manquants', () => {
    expect(parseAiMetadata('Voici le titre')).toBeNull();
    expect(parseAiMetadata('{"title":"","description":"d"}')).toBeNull();
    expect(parseAiMetadata('{"title":"t"}')).toBeNull();
    expect(parseAiMetadata('["t","d"]')).toBeNull();
  });
});
