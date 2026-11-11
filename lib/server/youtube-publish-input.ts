/** Validation de la demande de publication : bornes de YouTube, sans chevrons (refusés par l'API). */

import {
  cleanYoutubeTags,
  isYoutubeCategory,
  isYoutubeLanguage,
  YOUTUBE_DEFAULT_CATEGORY,
  YOUTUBE_DESCRIPTION_MAX,
  YOUTUBE_TAGS_MAX_CHARS,
  YOUTUBE_TITLE_MAX,
  youtubeTagsLength,
  type YoutubeCategory,
  type YoutubeLanguage,
} from '@/lib/youtube/metadata';

export type PublishInput = {
  exportJobId: string;
  /** Absent : la vidéo entière du cours (export `video`) ; sinon rang du chapitre (export `mp4`). */
  chapterIndex: number | null;
  title: string;
  description: string;
  tags: string[];
  categoryId: YoutubeCategory;
  /** null : la langue de la formation, résolue par la route. */
  defaultLanguage: YoutubeLanguage | null;
};

export type PublishInputResult = { ok: true; value: PublishInput } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rang de chapitre facultatif : entier positif ou nul, ou absent. `undefined` signale un rang invalide. */
export function parseChapterIndex(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) return undefined;
  return number;
}

export function parsePublishInput(body: unknown): PublishInputResult {
  if (!isRecord(body)) return { ok: false, message: 'Corps invalide' };
  const { exportJobId, chapterIndex, title, description, tags, categoryId, defaultLanguage } = body;

  if (typeof exportJobId !== 'string' || !UUID.test(exportJobId)) {
    return { ok: false, message: 'exportJobId invalide' };
  }
  // Le corps JSON porte un nombre ; une chaîne n'est acceptée que dans l'URL (parseChapterIndex).
  const chapter = typeof chapterIndex === 'string' ? undefined : parseChapterIndex(chapterIndex);
  if (chapter === undefined) return { ok: false, message: 'chapterIndex invalide' };

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > YOUTUBE_TITLE_MAX) {
    return { ok: false, message: `Le titre fait de 1 à ${YOUTUBE_TITLE_MAX} caractères` };
  }
  const cleanDescription = description === undefined ? '' : description;
  if (typeof cleanDescription !== 'string' || cleanDescription.length > YOUTUBE_DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `La description fait au plus ${YOUTUBE_DESCRIPTION_MAX} caractères`,
    };
  }
  if (/[<>]/.test(cleanTitle) || /[<>]/.test(cleanDescription)) {
    return { ok: false, message: 'Les signes < et > ne sont pas acceptés par YouTube' };
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    return { ok: false, message: 'Les étiquettes sont une liste' };
  }
  const cleanTags = cleanYoutubeTags(tags ?? []);
  if (youtubeTagsLength(cleanTags) > YOUTUBE_TAGS_MAX_CHARS) {
    return {
      ok: false,
      message: `Les étiquettes dépassent ${YOUTUBE_TAGS_MAX_CHARS} caractères au total`,
    };
  }
  if (categoryId !== undefined && !isYoutubeCategory(categoryId)) {
    return { ok: false, message: 'Catégorie YouTube non proposée' };
  }
  if (
    defaultLanguage !== undefined &&
    defaultLanguage !== null &&
    !isYoutubeLanguage(defaultLanguage)
  ) {
    return { ok: false, message: 'Langue non proposée' };
  }

  return {
    ok: true,
    value: {
      exportJobId,
      chapterIndex: chapter,
      title: cleanTitle,
      description: cleanDescription.trim(),
      tags: cleanTags,
      categoryId: categoryId ?? YOUTUBE_DEFAULT_CATEGORY,
      defaultLanguage: defaultLanguage ?? null,
    },
  };
}
