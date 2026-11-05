import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Chiffrement des secrets tenus en base (jeton d'un LRS, jeton YouTube) : AES-256-GCM, clé de
 * 32 octets en base64 dans LRS_CONFIG_ENCRYPTION_KEY (déjà transmise aux workers par le compose).
 * Les trois parties sont rendues en littéraux `bytea` hexadécimaux, prêts pour PostgREST.
 */
const ALGORITHM = 'aes-256-gcm';

export type SealedSecret = { ciphertext: string; iv: string; tag: string };

export function secretBoxKey(): Buffer {
  const encoded = process.env.LRS_CONFIG_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('LRS_CONFIG_ENCRYPTION_KEY is missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('LRS_CONFIG_ENCRYPTION_KEY must encode 32 bytes');
  return key;
}

function toBytea(value: Buffer): string {
  return `\\x${value.toString('hex')}`;
}

function fromBytea(value: string): Buffer {
  return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
}

export function sealSecret(plain: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, secretBoxKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    ciphertext: toBytea(ciphertext),
    iv: toBytea(iv),
    tag: toBytea(cipher.getAuthTag()),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, secretBoxKey(), fromBytea(sealed.iv));
  decipher.setAuthTag(fromBytea(sealed.tag));
  return Buffer.concat([decipher.update(fromBytea(sealed.ciphertext)), decipher.final()]).toString(
    'utf8',
  );
}

/** Signature d'une valeur courte (état OAuth) ; le domaine sépare les usages de la même clé. */
export function signValue(domain: string, value: string): string {
  return createHmac('sha256', secretBoxKey()).update(`${domain}:${value}`).digest('base64url');
}

export function verifySignedValue(domain: string, value: string, signature: string): boolean {
  const expected = Buffer.from(signValue(domain, value));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
