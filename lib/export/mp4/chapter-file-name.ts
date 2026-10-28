/** Caractères interdits dans un nom de fichier sous Windows, macOS ou Linux, et caractères de contrôle. */
const FORBIDDEN_IN_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_TITLE_LENGTH = 80;

/**
 * Nom du fichier d'un chapitre dans l'archive : numéro d'ordre sur autant de
 * chiffres qu'il en faut pour que le tri alphabétique suive l'ordre du cours,
 * puis le titre de la scène. Le numéro garantit l'unicité même si deux scènes
 * portent le même titre ; un titre vide ou illisible retombe sur « chapitre-N ».
 */
export function chapterFileName(
  index: number,
  total: number,
  title: string | null | undefined,
): string {
  const width = Math.max(2, String(total).length);
  const number = String(index + 1).padStart(width, '0');
  const readable = (title ?? '')
    .replace(FORBIDDEN_IN_FILE_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/[. ]+$/, '');
  return `${number}-${readable || `chapitre-${index + 1}`}.mp4`;
}
