import {
  createCipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

const FORMAT_VERSION = 1;
const ENVELOPE_INFO = Buffer.from('qalem-local-key-envelope-v1', 'utf8');
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

export type LocalLicenseClaims = {
  format_version: 1;
  package_id: string;
  content_sha256: string;
  user_id: string;
  tenant_id: string;
  device_id: string;
  device_key_sha256: string;
  issued_at: number;
  expires_at: number;
  revoked: false;
};

export type SignedLocalLicense = { claims: LocalLicenseClaims; signature: string };

export type LocalKeyEnvelope = {
  format_version: 1;
  ephemeral_public_key: string;
  nonce: string;
  ciphertext: string;
};

export type LocalEncryptedPackage = {
  license: SignedLocalLicense;
  nonce: string;
  ciphertext: string;
};

export type LocalPackageArtifact = {
  format_version: 1;
  package: LocalEncryptedPackage;
  key_envelope: LocalKeyEnvelope;
};

export type IssueLocalPackageInput = {
  packageId: string;
  userId: string;
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  expiresAt: Date;
  content: Uint8Array;
};

export class LocalContentSigningConfigurationError extends Error {}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodedLicense(license: SignedLocalLicense): Buffer {
  return Buffer.from(JSON.stringify(license), 'utf8');
}

function x25519PublicKey(raw: string): KeyObject {
  if (!BASE64URL_32_BYTES.test(raw))
    throw new LocalContentSigningConfigurationError('Invalid device key');
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, Buffer.from(raw, 'base64url')]),
    format: 'der',
    type: 'spki',
  });
}

function rawX25519PublicKey(key: KeyObject): string {
  const der = key.export({ format: 'der', type: 'spki' });
  if (!Buffer.from(der).subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)) {
    throw new LocalContentSigningConfigurationError('Unexpected X25519 public key');
  }
  return base64url(Buffer.from(der).subarray(-32));
}

export function localContentSigningKey(): KeyObject {
  const pem = process.env.QALEM_LOCAL_SIGNING_PRIVATE_KEY?.trim();
  if (!pem) {
    throw new LocalContentSigningConfigurationError(
      'QALEM_LOCAL_SIGNING_PRIVATE_KEY must be a durable Ed25519 PKCS#8 key',
    );
  }
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new LocalContentSigningConfigurationError('Qalem Local signing key must be Ed25519');
  }
  return key;
}

export function localContentVerifyingKey(signingKey = localContentSigningKey()): string {
  const jwk = createPublicKey(signingKey).export({ format: 'jwk' });
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
    throw new LocalContentSigningConfigurationError('Invalid Ed25519 public key');
  }
  return jwk.x;
}

export function issueLocalPackage(
  input: IssueLocalPackageInput,
  signingKey = localContentSigningKey(),
  issuedAt = new Date(),
): {
  artifact: Buffer;
  license: SignedLocalLicense;
  contentSha256: string;
  ciphertextSha256: string;
} {
  const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
  const expiresAtSeconds = Math.floor(input.expiresAt.getTime() / 1000);
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= issuedAtSeconds) {
    throw new LocalContentSigningConfigurationError('Local package expiry must be in the future');
  }

  const deviceKey = Buffer.from(input.devicePublicKey, 'base64url');
  const claims: LocalLicenseClaims = {
    format_version: FORMAT_VERSION,
    package_id: input.packageId,
    content_sha256: sha256(input.content),
    user_id: input.userId,
    tenant_id: input.tenantId,
    device_id: input.deviceId,
    device_key_sha256: sha256(deviceKey),
    issued_at: issuedAtSeconds,
    expires_at: expiresAtSeconds,
    revoked: false,
  };
  const signature = sign(null, Buffer.from(JSON.stringify(claims), 'utf8'), signingKey);
  const license: SignedLocalLicense = { claims, signature: base64url(signature) };
  const contentKey = randomBytes(32);
  const packageNonce = randomBytes(12);
  const packageCipher = createCipheriv('aes-256-gcm', contentKey, packageNonce);
  packageCipher.setAAD(encodedLicense(license));
  const packageCiphertext = Buffer.concat([
    packageCipher.update(input.content),
    packageCipher.final(),
    packageCipher.getAuthTag(),
  ]);
  const encryptedPackage: LocalEncryptedPackage = {
    license,
    nonce: base64url(packageNonce),
    ciphertext: base64url(packageCiphertext),
  };

  const { privateKey: ephemeralPrivateKey, publicKey: ephemeralPublicKey } =
    generateKeyPairSync('x25519');
  const envelopeKey = Buffer.from(
    hkdfSync(
      'sha256',
      diffieHellman({
        privateKey: ephemeralPrivateKey,
        publicKey: x25519PublicKey(input.devicePublicKey),
      }),
      encodedLicense(license),
      ENVELOPE_INFO,
      32,
    ),
  );
  const envelopeNonce = randomBytes(12);
  const envelopeCipher = createCipheriv('aes-256-gcm', envelopeKey, envelopeNonce);
  envelopeCipher.setAAD(encodedLicense(license));
  const envelopeCiphertext = Buffer.concat([
    envelopeCipher.update(contentKey),
    envelopeCipher.final(),
    envelopeCipher.getAuthTag(),
  ]);
  const artifact: LocalPackageArtifact = {
    format_version: FORMAT_VERSION,
    package: encryptedPackage,
    key_envelope: {
      format_version: FORMAT_VERSION,
      ephemeral_public_key: rawX25519PublicKey(ephemeralPublicKey),
      nonce: base64url(envelopeNonce),
      ciphertext: base64url(envelopeCiphertext),
    },
  };
  const artifactBytes = Buffer.from(JSON.stringify(artifact), 'utf8');
  return {
    artifact: artifactBytes,
    license,
    contentSha256: claims.content_sha256,
    ciphertextSha256: sha256(artifactBytes),
  };
}
