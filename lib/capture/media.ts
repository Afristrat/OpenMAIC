/**
 * Bornes de la narration et de la voix off de l'extension de capture.
 *
 * L'extension envoie un enregistrement ou un texte ; le serveur reste maître du fournisseur, du
 * modèle, de la voix et des plafonds. Aucune clé, aucune adresse, aucun modèle ne vient du client.
 */

import { z } from 'zod';

/** Un lot de narration dure au plus 25 s (MAX_BATCH_S de l'extension) : 8 Mo couvrent du 48 kHz mono. */
export const MAX_TRANSCRIBE_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSCRIBE_SECONDS = 60;

export const MAX_SPEAK_BODY_BYTES = 8_000;
export const MAX_SPEAK_CHARS = 1500;

/** Whisper est le seul modèle d'OpenAI qui rend les segments et les mots horodatés dont l'extension a besoin. */
export const TRANSCRIBE_MODEL_ID = 'whisper-1';

export const speakSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_SPEAK_CHARS),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)
    .optional(),
});

export type SpeakInput = z.infer<typeof speakSchema>;

/** Code de langue court accepté par le moteur de transcription (« fr-FR » devient « fr »). */
export function transcribeLanguage(raw: string | null): string | undefined {
  const base = raw?.trim().split('-')[0]?.toLowerCase();
  return base && /^[a-z]{2,3}$/.test(base) ? base : undefined;
}

/**
 * Durée d'un WAV tel que l'extension l'écrit : PCM 16 bits, en-tête canonique de 44 octets.
 *
 * Le débit facturé et la durée plafonnée se calculent ici, sur le contenu réellement reçu, jamais
 * sur un débit déclaré par le client : le taux d'échantillonnage, les canaux et la taille des
 * données doivent se recouper exactement avec l'en-tête et avec la taille du fichier. Tout autre
 * contenu (autre format, bloc supplémentaire, octets en trop, débit menteur) est refusé.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 46) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const blockAlign = channels * 2;
  const dataLength = bytes.byteLength - 44;
  const canonical =
    tag(0) === 'RIFF' &&
    view.getUint32(4, true) === bytes.byteLength - 8 &&
    tag(8) === 'WAVE' &&
    tag(12) === 'fmt ' &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    (channels === 1 || channels === 2) &&
    sampleRate >= 8_000 &&
    sampleRate <= 96_000 &&
    view.getUint32(28, true) === sampleRate * blockAlign &&
    view.getUint16(32, true) === blockAlign &&
    view.getUint16(34, true) === 16 &&
    tag(36) === 'data' &&
    view.getUint32(40, true) === dataLength &&
    dataLength % blockAlign === 0;
  return canonical ? dataLength / (sampleRate * blockAlign) : null;
}
