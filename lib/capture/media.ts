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

/** En-tête d'un fichier WAV RIFF : on refuse tout autre contenu avant de l'envoyer au fournisseur. */
export function isWavBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44) return false;
  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
}
