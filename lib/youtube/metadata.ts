/**
 * Métadonnées d'une vidéo YouTube publiée depuis Qalem : brouillon prérempli depuis la formation,
 * bornes imposées par YouTube et lecture de la proposition de l'IA.
 *
 * Bornes (developers.google.com/youtube/v3/docs/videos) : titre 1 à 100 caractères, description
 * 5 000 au plus, étiquettes 500 caractères au total (virgules comprises, une étiquette contenant
 * une espace compte ses guillemets), ni « < » ni « > » dans le titre ni la description.
 */

export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_DESCRIPTION_MAX = 5000;
export const YOUTUBE_TAGS_MAX_CHARS = 500;
/** Au-delà de ce nombre de caractères de description, « Améliorer avec l'IA » devient proposé. */
export const YOUTUBE_IMPROVE_MIN_CHARS = 200;

/** Catégories assignables retenues pour une formation (identifiants stables de YouTube). */
export const YOUTUBE_CATEGORIES = ['27', '28', '26', '22', '29'] as const;
export type YoutubeCategory = (typeof YOUTUBE_CATEGORIES)[number];
export const YOUTUBE_DEFAULT_CATEGORY: YoutubeCategory = '27'; // Éducation

export const YOUTUBE_LANGUAGES = ['fr', 'ar', 'en'] as const;
export type YoutubeLanguage = (typeof YOUTUBE_LANGUAGES)[number];

export type YoutubeMetadata = {
  title: string;
  description: string;
  tags: string[];
  categoryId: YoutubeCategory;
  defaultLanguage: YoutubeLanguage;
};

export function isYoutubeCategory(value: unknown): value is YoutubeCategory {
  return typeof value === 'string' && (YOUTUBE_CATEGORIES as readonly string[]).includes(value);
}

export function isYoutubeLanguage(value: unknown): value is YoutubeLanguage {
  return typeof value === 'string' && (YOUTUBE_LANGUAGES as readonly string[]).includes(value);
}

/** Langue de la formation (fr-FR, ar-MA, en-US…) ramenée au code accepté par YouTube. */
export function youtubeLanguageOf(locale: string | null | undefined): YoutubeLanguage {
  const code = (locale ?? '').slice(0, 2).toLowerCase();
  return isYoutubeLanguage(code) ? code : 'fr';
}

/** Longueur comptée par YouTube : virgules entre étiquettes, guillemets autour de celles à espace. */
export function youtubeTagsLength(tags: readonly string[]): number {
  return tags.reduce(
    (total, tag, index) => total + tag.length + (/\s/.test(tag) ? 2 : 0) + (index > 0 ? 1 : 0),
    0,
  );
}

const ANGLES = /[<>]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(text: string, max: number): string {
  return text.replace(ANGLES, '').replace(/\r\n?/g, '\n').trim().slice(0, max).trim();
}

/** Étiquettes nettoyées (sans chevrons, virgules ni guillemets) et sans doublon, casse ignorée. */
export function cleanYoutubeTags(input: readonly unknown[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw
      .replace(/[<>,"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    kept.push(tag);
    seen.add(key);
  }
  return kept;
}

/** Étiquettes nettoyées puis coupées pour tenir dans les 500 caractères de YouTube. */
export function normalizeYoutubeTags(input: readonly unknown[]): string[] {
  const kept: string[] = [];
  for (const tag of cleanYoutubeTags(input)) {
    if (youtubeTagsLength([...kept, tag]) > YOUTUBE_TAGS_MAX_CHARS) break;
    kept.push(tag);
  }
  return kept;
}

type DraftScene = { title: string | null };
type DraftInput = {
  courseName: string | null;
  courseDescription: string | null;
  language: string | null;
  /** Scènes de la formation, dans l'ordre. */
  scenes: DraftScene[];
  /** null : la vidéo entière ; sinon le rang du chapitre publié. */
  chapterIndex: number | null;
};

const WORDING: Record<YoutubeLanguage, { chapter: string; programme: string; course: string }> = {
  fr: { chapter: 'Chapitre', programme: 'Au programme :', course: 'Formation' },
  ar: { chapter: 'الفصل', programme: 'محاور الفيديو:', course: 'الدورة التكوينية' },
  en: { chapter: 'Chapter', programme: 'In this video:', course: 'Course' },
};

/** Brouillon déterministe, sans appel à l'IA : ce que la formation dit déjà d'elle-même. */
export function buildYoutubeDraft(input: DraftInput): YoutubeMetadata {
  const language = youtubeLanguageOf(input.language);
  const words = WORDING[language];
  const course = (input.courseName ?? '').trim();
  const sceneTitles = input.scenes
    .map((scene) => (scene.title ?? '').trim())
    .filter((title) => title.length > 0);

  let title: string;
  let description: string;
  if (input.chapterIndex === null) {
    title = course || sceneTitles[0] || words.course;
    const programme = sceneTitles.length
      ? `${words.programme}\n${sceneTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '';
    description = [input.courseDescription ?? '', programme].filter((p) => p.trim()).join('\n\n');
  } else {
    const sceneTitle = sceneTitles[input.chapterIndex] ?? '';
    const number = `${words.chapter} ${input.chapterIndex + 1}`;
    title = [course, sceneTitle || number].filter(Boolean).join(' · ');
    description = [
      sceneTitle ? `${number} : ${sceneTitle}` : number,
      course ? `${words.course} : ${course}` : '',
      input.courseDescription ?? '',
    ]
      .filter((p) => p.trim())
      .join('\n\n');
  }

  return {
    title: clean(title, YOUTUBE_TITLE_MAX) || words.course,
    description: clean(description, YOUTUBE_DESCRIPTION_MAX),
    tags: normalizeYoutubeTags(course ? [course] : []),
    categoryId: YOUTUBE_DEFAULT_CATEGORY,
    defaultLanguage: language,
  };
}

export type AiMetadata = Pick<YoutubeMetadata, 'title' | 'description' | 'tags'>;

/** Lit la proposition de l'IA : un objet { title, description, tags }, bornes de YouTube appliquées. */
export function parseAiMetadata(raw: string): AiMetadata | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const record = parsed;
  if (typeof record.title !== 'string' || typeof record.description !== 'string') return null;
  const title = clean(record.title, YOUTUBE_TITLE_MAX);
  const description = clean(record.description, YOUTUBE_DESCRIPTION_MAX);
  if (!title || !description) return null;
  const tags = Array.isArray(record.tags) ? normalizeYoutubeTags(record.tags) : [];
  return { title, description, tags };
}
