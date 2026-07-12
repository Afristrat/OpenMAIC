/**
 * Gate audio commune à toutes les sorties TTS (S1-009) :
 * 1) le texte arabe doit être vocalisé (tachkil) avant synthèse, sauf si le
 *    fournisseur cible est connu pour l'appliquer nativement ;
 * 2) la piste audio générée ne doit pas être sous le plancher de bruit -50 dB.
 *
 * Branchée au point de synthèse unique (generateTTS dans tts-providers.ts),
 * donc protège de facto tout appelant existant (chat live via
 * app/api/generate/tts/route.ts, pré-génération de narration de scène via
 * lib/server/classroom-media-generation.ts) et tout futur appelant qui
 * réutiliserait generateTTS().
 */

import type { TTSProviderId } from './types';

// Plages Unicode construites à partir de points de code hexadécimaux
// (0x....), jamais de caractères arabes littéraux dans le source : un aller-
// retour d'écriture de fichier sur des plages Unicode collées en clair dans
// une regex s'est révélé impossible à relire fiablement caractère par
// caractère pendant cette story (bug réel détecté par les tests unitaires,
// cf. .ralph/progress.md) — la construction par point de code hexadécimal
// est, elle, vérifiable sans ambiguïté contre la table Unicode officielle.
function codeRange(startHex: number, endHex: number): string {
  return `${String.fromCharCode(startHex)}-${String.fromCharCode(endHex)}`;
}

function buildCharClassRegex(ranges: Array<[number, number]>): RegExp {
  const body = ranges.map(([start, end]) => codeRange(start, end)).join('');
  return new RegExp(`[${body}]`);
}

// Bloc Arabic (0600-06FF) + Arabic Supplement (0750-077F) + Arabic
// Extended-A (08A0-08FF) — cf. chapitre Unicode "Arabic".
const ARABIC_SCRIPT_RE = buildCharClassRegex([
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
]);

// Diacritiques de vocalisation (tachkil) : fathatan/dammatan/kasratan,
// fatha/damma/kasra, shadda, sukun (064B-0652) + alif suscrit (0670) — le
// jeu standard utilisé par les bibliothèques de traitement de l'arabe
// (ex. pyarabic ARABIC_TASHKEEL) pour détecter la vocalisation complète.
const ARABIC_TASHKEEL_RE = buildCharClassRegex([
  [0x064b, 0x0652],
  [0x0670, 0x0670],
]);

/**
 * Fournisseurs TTS dont le backend applique nativement le tachkil (vérifié
 * pour VoxCPM/Dīwān — cf. .ralph/progress.md, entrée S0-006 : le /health du
 * studio Higgs, backend réel derrière voxcpm-tts, expose un indicateur
 * tachkil actif). À compléter si un autre fournisseur souverain confirme la
 * même capacité par une vérification équivalente.
 */
const TACHKIL_AWARE_TTS_PROVIDERS: ReadonlySet<TTSProviderId> = new Set(['voxcpm-tts']);

export class TachkilRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TachkilRequiredError';
  }
}

/** Détecte la présence de caractères en écriture arabe (arabe standard + supplément). */
export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

/** Détecte la présence d'au moins un diacritique de vocalisation (tachkil). */
export function hasArabicTashkeel(text: string): boolean {
  return ARABIC_TASHKEEL_RE.test(text);
}

/**
 * Rejette la synthèse si le texte contient de l'arabe non vocalisé et que le
 * fournisseur cible ne garantit pas la diacritisation automatique.
 */
export function assertArabicTachkilReady(text: string, providerId: TTSProviderId): void {
  if (!containsArabicScript(text) || hasArabicTashkeel(text)) return;
  if (TACHKIL_AWARE_TTS_PROVIDERS.has(providerId)) return;

  throw new TachkilRequiredError(
    `Tachkil requis : texte arabe non vocalisé (diacritiques absents) et le fournisseur TTS "${providerId}" ne garantit pas la diacritisation automatique.`,
  );
}

export const NOISE_FLOOR_DBFS = -50;

export class NoiseFloorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoiseFloorError';
  }
}

interface WavPcmChunk {
  audioFormat: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

/** Parse minimal des chunks RIFF/WAVE nécessaires (fmt + data), sans dépendance. */
function findWavPcmChunk(audio: Uint8Array): WavPcmChunk | null {
  if (audio.length < 12) return null;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const riff = String.fromCharCode(audio[0], audio[1], audio[2], audio[3]);
  const wave = String.fromCharCode(audio[8], audio[9], audio[10], audio[11]);
  if (riff !== 'RIFF' || wave !== 'WAVE') return null;

  let offset = 12;
  let audioFormat: number | null = null;
  let bitsPerSample: number | null = null;
  let dataOffset: number | null = null;
  let dataLength: number | null = null;

  while (offset + 8 <= audio.length) {
    const chunkId = String.fromCharCode(
      audio[offset],
      audio[offset + 1],
      audio[offset + 2],
      audio[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === 'fmt ' && chunkDataStart + 16 <= audio.length) {
      audioFormat = view.getUint16(chunkDataStart, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataLength = Math.max(0, Math.min(chunkSize, audio.length - chunkDataStart));
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat === null ||
    bitsPerSample === null ||
    dataOffset === null ||
    dataLength === null
  ) {
    return null;
  }
  return { audioFormat, bitsPerSample, dataOffset, dataLength };
}

/**
 * Calcule le niveau crête (dBFS) d'un WAV PCM 16 bits. Retourne `null` si le
 * format n'est pas un WAV PCM 16 bits reconnaissable — silencieusement
 * ignoré par `assertAboveNoiseFloor` plutôt que de faire échouer une sortie
 * valide dans un format qu'on ne sait pas décoder.
 *
 * ponytail: décodage limité au WAV/PCM16 (couvre le studio souverain
 * VoxCPM/Dīwān, vérifié WAV PCM 16 bits mono en production lors de S0-006) ;
 * réexaminer si un besoin réel de valider le niveau de formats compressés
 * (mp3/opus/flac) apparaît pour un fournisseur devenu majoritaire en arabe.
 */
export function computeWavPeakDbfs(audio: Uint8Array): number | null {
  const pcm = findWavPcmChunk(audio);
  if (!pcm || pcm.audioFormat !== 1 || pcm.bitsPerSample !== 16) return null;
  if (pcm.dataLength < 2) return null;

  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const sampleCount = Math.floor(pcm.dataLength / 2);
  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const abs = Math.abs(view.getInt16(pcm.dataOffset + i * 2, true));
    if (abs > peak) peak = abs;
  }

  if (peak === 0) return -Infinity;
  return 20 * Math.log10(peak / 32768);
}

/**
 * Rejette la synthèse si la piste audio générée est sous le plancher de
 * bruit -50 dB. N'agit que sur les sorties WAV PCM 16 bits reconnaissables
 * (cf. `computeWavPeakDbfs`) ; les autres formats/tailles passent sans
 * vérification (limite documentée ci-dessus).
 */
export function assertAboveNoiseFloor(audio: Uint8Array, format: string): void {
  if (format !== 'wav') return;
  const dbfs = computeWavPeakDbfs(audio);
  if (dbfs === null) return;
  if (dbfs < NOISE_FLOOR_DBFS) {
    const dbfsLabel = dbfs === -Infinity ? '-Inf' : dbfs.toFixed(1);
    throw new NoiseFloorError(
      `Piste audio rejetée : niveau ${dbfsLabel} dB sous le plancher de bruit (${NOISE_FLOOR_DBFS} dB).`,
    );
  }
}
