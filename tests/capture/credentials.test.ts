import { describe, expect, it } from 'vitest';
import {
  TOKEN_PREFIX,
  bearerToken,
  generateCaptureToken,
  generatePairingCode,
  isWellFormedPairingCode,
  normalizePairingCode,
  sha256Hex,
} from '@/lib/capture/credentials';

describe('generateCaptureToken', () => {
  it('produit un jeton préfixé, non répété, et son empreinte SHA-256', () => {
    const a = generateCaptureToken();
    const b = generateCaptureToken();
    expect(a.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(sha256Hex(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

describe('codes d’appairage', () => {
  it('produit 8 caractères sans ambiguïté de lecture', () => {
    for (let i = 0; i < 200; i += 1) {
      const { code, hash } = generatePairingCode();
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      expect(isWellFormedPairingCode(code)).toBe(true);
      expect(hash).toBe(sha256Hex(code));
    }
  });

  it('normalise la saisie (casse, espaces, tirets)', () => {
    expect(normalizePairingCode(' ab3d-e4fg ')).toBe('AB3DE4FG');
  });

  it('refuse une saisie mal formée', () => {
    for (const bad of ['', 'ABC', 'ABCDEFG0', 'ABCDEFGHI', 'abcdefgh', 'ABCD EFG']) {
      expect(isWellFormedPairingCode(bad)).toBe(false);
    }
  });
});

describe('bearerToken', () => {
  const { token } = generateCaptureToken();

  it('extrait le jeton d’un en-tête valide', () => {
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer   ${token}  `)).toBe(token);
  });

  it('refuse un en-tête absent, d’un autre schéma, ou sans le préfixe Qalem', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken(`Basic ${token}`)).toBeNull();
    expect(bearerToken('Bearer eyJhbGciOi.autre.jwt')).toBeNull();
    expect(bearerToken(`Bearer ${token} extra`)).toBeNull();
  });
});
