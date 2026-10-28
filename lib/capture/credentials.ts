/**
 * Jeton de l'extension et code d'appairage.
 *
 * Seule l'empreinte SHA-256 est stockée. Le jeton est tiré de 32 octets aléatoires (256 bits) : une
 * empreinte rapide suffit, un mot de passe lent n'apporte rien à une valeur non devinable. Le code
 * d'appairage est court pour être saisi ou transmis par le pont ; il vit 5 minutes, sert une fois
 * et se bloque après quelques échecs.
 */

import { createHash, randomBytes, randomInt } from 'node:crypto';

export const TOKEN_PREFIX = 'qcap_';
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
export const PAIRING_MAX_FAILED_ATTEMPTS = 5;

// Sans 0/O/1/I/L : le code se lit à voix haute ou se recopie sans ambiguïté.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateCaptureToken(): { token: string; hash: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, hash: sha256Hex(token) };
}

export function generatePairingCode(): { code: string; hash: string } {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return { code, hash: sha256Hex(code) };
}

/** Normalise la saisie d'un code (casse, espaces, tirets) avant de l'empreinter. */
export function normalizePairingCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

export function isWellFormedPairingCode(normalized: string): boolean {
  return (
    normalized.length === CODE_LENGTH && [...normalized].every((c) => CODE_ALPHABET.includes(c))
  );
}

/** Extrait le jeton d'un en-tête `Authorization: Bearer …`, ou null si absent ou mal formé. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  return token && token.startsWith(TOKEN_PREFIX) ? token : null;
}
