/**
 * Étape de capture de navigation (format_version 1) : validation à la frontière.
 *
 * L'extension envoie des étapes ; le serveur ne fait confiance à rien. Les schémas sont stricts
 * (un champ inconnu est refusé, pour qu'aucun href, sélecteur CSS ou titre de fenêtre ne passe en
 * contrebande), l'URL est réduite à l'origine et au chemin, et tout texte qui ressemble à une
 * donnée personnelle ou à un secret est refusé plutôt que nettoyé : l'auteur recapture, il ne
 * stocke pas une donnée que l'outil aurait dû masquer.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CAPTURE_FORMAT_VERSION = 1;
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export const CAPTURE_ACTIONS = ['click', 'type', 'navigate', 'scroll', 'select', 'key'] as const;

const MAX_TEXT = 2000;
const MAX_LABEL = 200;

const coordinate = z.number().finite().min(-100_000).max(100_000);
const rect = z.strictObject({ x: coordinate, y: coordinate, w: coordinate, h: coordinate });

export const captureStepSchema = z.strictObject({
  position: z.number().int().min(0).max(10_000),
  capturedAt: z.iso.datetime(),
  action: z.enum(CAPTURE_ACTIONS),
  url: z.string().min(1).max(2048),
  element: z
    .strictObject({
      label: z.string().max(MAX_LABEL).optional(),
      role: z.string().max(60).optional(),
      tag: z.string().max(40).optional(),
      rect: rect.optional(),
    })
    .default({}),
  pointer: z.strictObject({ x: coordinate, y: coordinate }).optional(),
  viewport: z
    .strictObject({
      w: z.number().int().min(1).max(20_000),
      h: z.number().int().min(1).max(20_000),
      dpr: z.number().min(0.5).max(8).optional(),
    })
    .default({ w: 1, h: 1 }),
  description: z.string().max(MAX_TEXT).default(''),
  redactions: z
    .array(z.strictObject({ kind: z.string().max(40), rect: rect.optional() }))
    .max(200)
    .default([]),
  /** JPEG en base64, sans préfixe data:. Absent pour une étape sans image. */
  screenshot: z
    .string()
    .max(Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 8)
    .optional(),
});

export type CaptureStepInput = z.infer<typeof captureStepSchema>;

/** Origine + chemin uniquement : ni requête, ni fragment, ni identifiants. Renvoie null si refusée. */
export function normalizeStepUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return null;
  }
  if (raw.includes('?') || raw.includes('#') || raw.includes('@')) return null;
  const normalized = `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  return normalized.length <= 2048 ? normalized : null;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/;
const BEARER = /\bbearer\s+[\w.~+/-]{16,}/i;
const LONG_SECRET = /\b(?:[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{40,})\b/;
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
/** Au moins 9 chiffres : une date ISO (8 chiffres) ou un numéro d'étape ne passe pas pour un téléphone. */
const PHONE_MIN_DIGITS = 9;
const CARD = /\b(?:\d[ -]?){13,19}\b/;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Motif sensible trouvé dans un texte libre, ou null. Le texte lui-même n'est jamais renvoyé. */
export function findSensitivePattern(text: string): string | null {
  if (EMAIL.test(text)) return 'email';
  if (JWT.test(text) || BEARER.test(text)) return 'token';
  const card = CARD.exec(text);
  if (card) {
    const digits = card[0].replace(/\D/g, '');
    if (digits.length >= 13 && luhnValid(digits)) return 'card';
  }
  for (const match of text.matchAll(PHONE)) {
    if (match[0].replace(/\D/g, '').length >= PHONE_MIN_DIGITS) return 'phone';
  }
  if (LONG_SECRET.test(text)) return 'secret';
  return null;
}

export type StepRefusal = { field: string; reason: string };

/** Contrôle les textes libres de l'étape ; première violation, sans écho de la valeur. */
export function findStepRefusal(step: CaptureStepInput): StepRefusal | null {
  const texts: Array<[string, string | undefined]> = [
    ['description', step.description],
    ['element.label', step.element.label],
  ];
  for (const [field, value] of texts) {
    if (!value) continue;
    const pattern = findSensitivePattern(value);
    if (pattern) return { field, reason: pattern };
  }
  return null;
}

export type DecodedScreenshot = { bytes: Buffer; sha256: string };

/** Décode une capture JPEG : signature et taille contrôlées côté serveur, jamais sur la foi du client. */
export function decodeScreenshot(base64: string): DecodedScreenshot | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) return null;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const hasEnd = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (!isJpeg || !hasEnd) return null;
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** JSON canonique (clés triées) : même contenu, même empreinte, quel que soit l'ordre d'envoi. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Empreinte du contenu de l'étape (hors image, couverte par screenshot_sha256). */
export function stepContentHash(
  step: CaptureStepInput,
  url: string,
  screenshotSha256: string | null,
): string {
  // L'image n'entre pas dans l'empreinte du contenu : son empreinte propre la représente.
  const content = { ...step, screenshot: undefined };
  return createHash('sha256')
    .update(
      canonicalJson({ ...content, url, formatVersion: CAPTURE_FORMAT_VERSION, screenshotSha256 }),
    )
    .digest('hex');
}
