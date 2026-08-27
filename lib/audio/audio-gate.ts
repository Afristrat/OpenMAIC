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
import { spawn } from 'node:child_process';

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
 * tachkil actif). Le service a depuis migré vers Higgs Audio v3, exposé sous
 * le provider `higgs-tts` (protocole OpenAI-compatible /v1/audio/speech,
 * distinct du protocole VoxCPM natif) — même capacité tachkil native
 * (Fine-Tashkeel intégré côté serveur, cf. server_higgs.py). À compléter si
 * un autre fournisseur souverain confirme la même capacité par une
 * vérification équivalente.
 */
const TACHKIL_AWARE_TTS_PROVIDERS: ReadonlySet<TTSProviderId> = new Set([
  'voxcpm-tts',
  'higgs-tts',
]);

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

export class AudioGateFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioGateFormatError';
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
 * format n'est pas un WAV PCM 16 bits reconnaissable.
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

const FFMPEG_AUDIO_GATE_TIMEOUT_MS = 15_000;

function computePcm16PeakDbfs(audio: Uint8Array): number | null {
  if (audio.length < 2) return null;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const sampleCount = Math.floor(audio.length / 2);
  let peak = 0;
  for (let index = 0; index < sampleCount; index++) {
    const absoluteSample = Math.abs(view.getInt16(index * 2, true));
    if (absoluteSample > peak) peak = absoluteSample;
  }
  if (peak === 0) return -Infinity;
  return 20 * Math.log10(peak / 32768);
}

/** Décode un MP3 en PCM16 avec le même FFmpeg requis par l'export MP4. */
async function computeMp3PeakDbfs(audio: Uint8Array): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'mp3',
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      ffmpeg.kill('SIGKILL');
      reject(
        new AudioGateFormatError(
          `Piste audio rejetée : décodage MP3 interrompu après ${FFMPEG_AUDIO_GATE_TIMEOUT_MS} ms.`,
        ),
      );
    }, FFMPEG_AUDIO_GATE_TIMEOUT_MS);

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    ffmpeg.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new AudioGateFormatError(
          `Piste audio rejetée : FFmpeg est indisponible pour contrôler le MP3 (${error.message}).`,
        ),
      );
    });
    ffmpeg.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim();
        reject(
          new AudioGateFormatError(
            `Piste audio rejetée : MP3 illisible${detail ? ` (${detail})` : ''}.`,
          ),
        );
        return;
      }
      const pcm = Buffer.concat(chunks);
      const dbfs = computePcm16PeakDbfs(pcm);
      if (dbfs === null) {
        reject(
          new AudioGateFormatError('Piste audio rejetée : MP3 décodé sans échantillon audio.'),
        );
        return;
      }
      resolve(dbfs);
    });
    ffmpeg.stdin.end(audio);
  });
}

/**
 * Rejette la synthèse si la piste audio générée est sous le plancher de
 * bruit -50 dB. Les formats réellement servis par défaut sont contrôlés :
 * WAV PCM16 sans dépendance et MP3 via FFmpeg. Tout autre format est rejeté
 * explicitement afin qu'aucune sortie ne contourne silencieusement la gate.
 */
export async function assertAboveNoiseFloor(audio: Uint8Array, format: string): Promise<void> {
  const normalizedFormat = format.trim().toLowerCase();
  let dbfs: number | null;
  if (normalizedFormat === 'wav' || normalizedFormat === 'wave') {
    dbfs = computeWavPeakDbfs(audio);
    if (dbfs === null) {
      throw new AudioGateFormatError('Piste audio rejetée : WAV non PCM16 ou illisible.');
    }
  } else if (normalizedFormat === 'mp3' || normalizedFormat === 'mpeg') {
    dbfs = await computeMp3PeakDbfs(audio);
  } else {
    throw new AudioGateFormatError(
      `Piste audio rejetée : format "${format}" non contrôlable par la gate audio.`,
    );
  }
  if (dbfs < NOISE_FLOOR_DBFS) {
    const dbfsLabel = dbfs === -Infinity ? '-Inf' : dbfs.toFixed(1);
    throw new NoiseFloorError(
      `Piste audio rejetée : niveau ${dbfsLabel} dB sous le plancher de bruit (${NOISE_FLOOR_DBFS} dB).`,
    );
  }
}
