/** Validation de la demande de publication : bornes de YouTube, sans chevrons (refusés par l'API). */

export type PublishInput = {
  exportJobId: string;
  /** Absent : la vidéo entière du cours (export `video`) ; sinon rang du chapitre (export `mp4`). */
  chapterIndex: number | null;
  title: string;
  description: string;
};

export type PublishInputResult = { ok: true; value: PublishInput } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;

export function parsePublishInput(body: unknown): PublishInputResult {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'Corps invalide' };
  const { exportJobId, chapterIndex, title, description } = body as Record<string, unknown>;

  if (typeof exportJobId !== 'string' || !UUID.test(exportJobId)) {
    return { ok: false, message: 'exportJobId invalide' };
  }
  let chapter: number | null = null;
  if (chapterIndex !== undefined && chapterIndex !== null) {
    if (typeof chapterIndex !== 'number' || !Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return { ok: false, message: 'chapterIndex invalide' };
    }
    chapter = chapterIndex;
  }
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > TITLE_MAX) {
    return { ok: false, message: `Le titre fait de 1 à ${TITLE_MAX} caractères` };
  }
  const cleanDescription = description === undefined ? '' : description;
  if (typeof cleanDescription !== 'string' || cleanDescription.length > DESCRIPTION_MAX) {
    return { ok: false, message: `La description fait au plus ${DESCRIPTION_MAX} caractères` };
  }
  if (/[<>]/.test(cleanTitle) || /[<>]/.test(cleanDescription)) {
    return { ok: false, message: 'Les signes < et > ne sont pas acceptés par YouTube' };
  }
  return {
    ok: true,
    value: {
      exportJobId,
      chapterIndex: chapter,
      title: cleanTitle,
      description: cleanDescription.trim(),
    },
  };
}
